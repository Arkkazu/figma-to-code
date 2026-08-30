#!/usr/bin/env node
// accessibility-verify.mjs — Q-13 の機械検証（axe-core / コントラスト / キーボード）。
//
// Usage:
//   node MyBrain/verify/accessibility-verify.mjs <config.json> [url] [report.json]
//
// axe-core は案件が管理するローカルの sourcePath から注入する。ネットワークCDNを
// 実行時に読まないため、検証対象と検証エンジンの版を案件の依存関係へ固定できる。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { navigateAndWait, startCdpBrowser, waitFor } from "./cdp-browser.mjs";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "[tabindex]",
  '[contenteditable="true"]',
  "audio[controls]",
  "video[controls]",
  "iframe",
].join(", ");

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

function fail(message) {
  throw new Error(`ACCESSIBILITY VERIFY: ${message}`);
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be a non-empty string.`);
  return value.trim();
}

function requireArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  return value;
}

function readJson(pathname, label) {
  if (!existsSync(pathname)) fail(`${label} does not exist: ${pathname}`);
  try {
    return JSON.parse(readFileSync(pathname, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function writeJson(pathname, value) {
  mkdirSync(dirname(pathname), { recursive: true });
  writeFileSync(pathname, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolveProjectPath(projectRoot, value, label) {
  const relative = requireString(value, label);
  const pathname = resolve(projectRoot, relative);
  const relativePath = pathname.slice(projectRoot.length + 1);
  if (pathname !== projectRoot && (relativePath === "" || relativePath.startsWith(".."))) {
    fail(`${label} must stay inside the project root.`);
  }
  return pathname;
}

function keyboardParams(key, shiftKey = false) {
  const keys = {
    Escape: { code: "Escape", keyCode: 27 },
    Tab: { code: "Tab", keyCode: 9 },
    Enter: { code: "Enter", keyCode: 13, text: "\r" },
    " ": { code: "Space", keyCode: 32, text: " " },
  };
  const definition = keys[key] || { code: key, keyCode: 0 };
  return {
    key,
    code: definition.code,
    windowsVirtualKeyCode: definition.keyCode,
    nativeVirtualKeyCode: definition.keyCode,
    ...(definition.text ? { text: definition.text, unmodifiedText: definition.text } : {}),
    modifiers: shiftKey ? 8 : 0,
  };
}

async function dispatchKey(browser, key, shiftKey = false) {
  const params = keyboardParams(key, shiftKey);
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", ...params });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", ...params });
}

// Input.dispatchMouseEvent は「その座標に居るもの」を押す。要素を押すのではない。
// 旧実装は矩形と可視性だけを見て中心座標へ撃っており、次の2つを確かめていなかった。
//
//   1. 要素が viewport 内にあるか。画面外だと座標が viewport の外になり、クリックが落ちない。
//   2. その座標で実際に受け取るのが対象自身か。固定ヘッダーやオーバーレイが覆っていると
//      クリックは別要素へ入り、対象の状態は変わらないまま待ちだけがタイムアウトする。
//
// 実測（2026-08-30、rpa-technologies-theme）: Q-13 が同じ実装に対して通ったり落ちたりし、
// 「検証器の状態遷移が不安定」と報告された。原因はページ側ではなく、この座標クリックである。
// 覆われている場合は何が覆っているかを名指しする。原因を推測させない。
async function clickSelector(browser, selector) {
  const point = await browser.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return { error: "not-found" };
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (rect.width <= 0 || rect.height <= 0 || style.display === "none" || style.visibility === "hidden") return { error: "not-visible" };
    if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) {
      return { error: "outside-viewport" };
    }
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (!hit) return { error: "no-element-at-point" };
    if (hit !== element && !element.contains(hit) && !hit.contains(element)) {
      const name = hit.tagName.toLowerCase()
        + (hit.id ? "#" + hit.id : "")
        + (typeof hit.className === "string" && hit.className.trim() ? "." + hit.className.trim().split(/\\s+/)[0] : "");
      return { error: "covered-by:" + name };
    }
    return { x, y };
  })()`);
  if (!point || point.error) fail(`Cannot click ${selector}: ${point?.error ?? "unknown error"}.`);
  await browser.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await browser.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
}

function validateApprovedException(value, label) {
  const exception = requireObject(value, label);
  requireString(exception.id, `${label}.id`);
  requireString(exception.ruleId, `${label}.ruleId`);
  requireString(exception.target, `${label}.target`);
  requireString(exception.specPath, `${label}.specPath`);
  if (requireString(exception.specNote, `${label}.specNote`).length < 20) fail(`${label}.specNote must describe the approved exception in at least 20 characters.`);
  const approval = requireObject(exception.ownerApproval, `${label}.ownerApproval`);
  if (approval.status !== "approved") fail(`${label}.ownerApproval.status must be "approved".`);
  requireString(approval.by, `${label}.ownerApproval.by`);
  requireString(approval.reference, `${label}.ownerApproval.reference`);
  return exception;
}

function validateContrastException(value, label) {
  const exception = requireObject(value, label);
  requireString(exception.targetId, `${label}.targetId`);
  requireString(exception.specPath, `${label}.specPath`);
  if (requireString(exception.specNote, `${label}.specNote`).length < 20) fail(`${label}.specNote must describe the approved exception in at least 20 characters.`);
  const approval = requireObject(exception.ownerApproval, `${label}.ownerApproval`);
  if (approval.status !== "approved") fail(`${label}.ownerApproval.status must be "approved".`);
  requireString(approval.by, `${label}.ownerApproval.by`);
  requireString(approval.reference, `${label}.ownerApproval.reference`);
  return exception;
}

// 色に起因する検査だけを止める口。案件のブランド色がAAを僅かに下回る場合、
// 個別 approvedExceptions をページごとに積み上げても同じ作業を繰り返すだけになるため、
// オーナーが案件単位で「色は見ない」と決められるようにする。
//
// **エージェントが独断で無効化できないようにする**のがこのブロックの要件である。
// 承認記録・根拠ファイルの実在・20文字以上の理由をすべて必須にし、
// 下の axe.rules / disableRules / runOptions / exclude の禁止はそのまま残す。
// 任意のルールを止める汎用スイッチにはしない。
const COLOR_AXE_RULE_IDS = new Set(["color-contrast", "color-contrast-enhanced", "link-in-text-block"]);

function validateColorChecks(raw, projectRoot) {
  if (raw === undefined) return { status: "enabled" };
  const block = requireObject(raw, "config.colorChecks");
  const status = requireString(block.status, "config.colorChecks.status");
  if (status !== "enabled" && status !== "disabled") fail('config.colorChecks.status must be "enabled" or "disabled".');
  if (status === "enabled") return { status };

  const specPath = resolveProjectPath(projectRoot, requireString(block.specPath, "config.colorChecks.specPath"), "config.colorChecks.specPath");
  if (!existsSync(specPath)) fail(`config.colorChecks.specPath does not exist: ${specPath}`);
  const reason = requireString(block.reason, "config.colorChecks.reason");
  if (reason.trim().length < 20) fail("config.colorChecks.reason must state the reason in at least 20 characters.");
  const ownerApproval = requireObject(block.ownerApproval, "config.colorChecks.ownerApproval");
  if (ownerApproval.status !== "approved") fail('config.colorChecks.ownerApproval.status must be "approved".');
  requireString(ownerApproval.by, "config.colorChecks.ownerApproval.by");
  requireString(ownerApproval.reference, "config.colorChecks.ownerApproval.reference");
  return { status, specPath: block.specPath, reason, ownerApproval, disabledRuleIds: [...COLOR_AXE_RULE_IDS] };
}

function validateConfig(raw, projectRoot) {
  const config = requireObject(raw, "config");
  const viewportPolicy = requireObject(config.viewportPolicy, "config.viewportPolicy");
  if (viewportPolicy.scrollbars !== "hidden" && viewportPolicy.scrollbars !== "visible") {
    fail('config.viewportPolicy.scrollbars must be "hidden" or "visible".');
  }
  const colorChecks = validateColorChecks(config.colorChecks, projectRoot);

  const axe = requireObject(config.axe, "config.axe");
  if (axe.rules !== undefined || axe.disableRules !== undefined || axe.runOptions !== undefined || axe.exclude !== undefined) {
    fail("config.axe must not disable, exclude, or override axe rules. axe-core is always run with the fixed WCAG A/AA tag set.");
  }
  const axeSourcePath = resolveProjectPath(projectRoot, axe.sourcePath, "config.axe.sourcePath");
  if (!existsSync(axeSourcePath)) fail(`config.axe.sourcePath does not exist: ${axeSourcePath}`);
  const axeExceptions = (axe.approvedExceptions === undefined ? [] : requireArray(axe.approvedExceptions, "config.axe.approvedExceptions"))
    .map((item, index) => validateApprovedException(item, `config.axe.approvedExceptions[${index}]`));

  const contrast = requireObject(config.contrast, "config.contrast");
  const targets = requireArray(contrast.targets, "config.contrast.targets");
  // 色検査を止めている案件では、宣言すべきターゲットがそもそも無い。
  if (targets.length === 0 && colorChecks.status !== "disabled") {
    fail("config.contrast.targets must contain every machine-verifiable text/UI contrast target.");
  }
  const targetIds = new Set();
  for (const [index, target] of targets.entries()) {
    const label = `config.contrast.targets[${index}]`;
    requireObject(target, label);
    const id = requireString(target.id, `${label}.id`);
    if (targetIds.has(id)) fail(`${label}.id duplicates ${id}.`);
    targetIds.add(id);
    requireString(target.selector, `${label}.selector`);
    if (target.kind !== "text" && target.kind !== "ui") fail(`${label}.kind must be "text" or "ui".`);
    if (target.kind === "ui") requireString(target.foregroundProperty, `${label}.foregroundProperty`);
    if (target.backgroundScope !== undefined && target.backgroundScope !== "self" && target.backgroundScope !== "behind") {
      fail(`${label}.backgroundScope must be "self" or "behind".`);
    }
  }
  const contrastExceptions = (contrast.approvedExceptions === undefined ? [] : requireArray(contrast.approvedExceptions, "config.contrast.approvedExceptions"))
    .map((item, index) => validateContrastException(item, `config.contrast.approvedExceptions[${index}]`));
  for (const exception of contrastExceptions) if (!targetIds.has(exception.targetId)) fail(`config.contrast.approvedExceptions targets unknown id: ${exception.targetId}.`);

  const keyboard = requireObject(config.keyboard, "config.keyboard");
  const stateFlows = keyboard.stateFlows === undefined ? [] : requireArray(keyboard.stateFlows, "config.keyboard.stateFlows");
  const dialogs = keyboard.dialogs === undefined ? [] : requireArray(keyboard.dialogs, "config.keyboard.dialogs");
  for (const [index, flow] of stateFlows.entries()) {
    const label = `config.keyboard.stateFlows[${index}]`;
    requireString(requireObject(flow, label).name, `${label}.name`);
    requireString(flow.triggerSelector, `${label}.triggerSelector`);
  }
  for (const [index, dialog] of dialogs.entries()) {
    const label = `config.keyboard.dialogs[${index}]`;
    requireString(requireObject(dialog, label).name, `${label}.name`);
    requireString(dialog.triggerSelector, `${label}.triggerSelector`);
    requireString(dialog.dialogSelector, `${label}.dialogSelector`);
    requireString(dialog.firstSelector, `${label}.firstSelector`);
    requireString(dialog.lastSelector, `${label}.lastSelector`);
  }

  return {
    ...config,
    viewportPolicy,
    colorChecks,
    axe: { ...axe, sourcePath: axeSourcePath, approvedExceptions: axeExceptions },
    contrast: { ...contrast, targets, approvedExceptions: contrastExceptions },
    keyboard: { ...keyboard, stateFlows, dialogs },
  };
}

async function injectAndRunAxe(browser, config) {
  const source = readFileSync(config.axe.sourcePath, "utf8");
  await browser.evaluate(`${source}\n//# sourceURL=accessibility-verify-axe-injection.js\nvoid 0;`);
  const result = await browser.evaluate(`(async () => {
    if (!globalThis.axe || typeof globalThis.axe.run !== "function") return { runtimeError: "axe.run was not defined by the injected source." };
    const result = await globalThis.axe.run(document, {
      runOnly: { type: "tag", values: ${JSON.stringify(AXE_TAGS)} },
    });
    return {
      violations: (result.violations || []).map((violation) => ({
        id: violation.id,
        impact: violation.impact || null,
        help: violation.help || null,
        description: violation.description || null,
        helpUrl: violation.helpUrl || null,
        nodes: (violation.nodes || []).map((node) => ({
          target: Array.isArray(node.target) ? node.target.join(" >>> ") : String(node.target || ""),
          html: node.html || null,
          failureSummary: node.failureSummary || null,
        })),
      })),
    };
  })()`, { awaitPromise: true });
  if (!result || result.runtimeError) fail(`axe-core execution failed: ${result?.runtimeError ?? "no result"}`);

  const colorDisabled = config.colorChecks?.status === "disabled";
  const approved = [];
  const unapproved = [];
  const colorSkipped = [];
  for (const violation of result.violations || []) {
    const isColorRule = COLOR_AXE_RULE_IDS.has(violation.id);
    for (const node of violation.nodes || []) {
      // 停止していても走査自体は行い、件数を証跡に残す。黙って消さない。
      if (colorDisabled && isColorRule) { colorSkipped.push({ violation, node }); continue; }
      const exception = config.axe.approvedExceptions.find((candidate) => candidate.ruleId === violation.id && candidate.target === node.target);
      if (exception) approved.push({ violation, node, exceptionId: exception.id });
      else unapproved.push({ violation, node });
    }
  }
  return {
    tags: AXE_TAGS,
    totalViolationRules: (result.violations || []).length,
    totalViolationNodes: (result.violations || []).reduce((count, violation) => count + violation.nodes.length, 0),
    approvedExceptions: approved,
    unapprovedViolations: unapproved,
    colorChecksDisabled: colorDisabled
      ? { ruleIds: [...COLOR_AXE_RULE_IDS], skippedNodeCount: colorSkipped.length, skipped: colorSkipped }
      : null,
  };
}

function contrastExpression(targets) {
  return `(() => {
    const targets = ${JSON.stringify(targets)};
    const parseColor = (value) => {
      const match = String(value || "").match(/^rgba?\\(([^)]+)\\)$/i);
      if (!match) return null;
      const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
      if (parts.length < 3 || parts.slice(0, 3).some((part) => !Number.isFinite(part))) return null;
      return { r: parts[0], g: parts[1], b: parts[2], a: Number.isFinite(parts[3]) ? parts[3] : 1 };
    };
    const composite = (top, bottom) => {
      const alpha = top.a + bottom.a * (1 - top.a);
      if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / alpha,
        g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / alpha,
        b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / alpha,
        a: alpha,
      };
    };
    const luminance = (color) => {
      const channel = (value) => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
    };
    const visible = (element) => {
      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden") return false;
      }
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const opacityOf = (style) => {
      const value = Number.parseFloat(style.opacity);
      return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
    };
    const layerReason = (element, style = getComputedStyle(element)) => {
      if (style.backgroundImage !== "none") return "background-image-or-gradient";
      if (style.mixBlendMode !== "normal") return "blend-mode";
      if (/^(IMG|VIDEO|CANVAS|SVG|IFRAME|OBJECT|EMBED)$/.test(element.tagName)) return element.tagName.toLowerCase() + "-overlaps-target";
      return null;
    };
    const overlapPoint = (first, second) => {
      const left = Math.max(first.left, second.left, 0);
      const top = Math.max(first.top, second.top, 0);
      const right = Math.min(first.right, second.right, window.innerWidth);
      const bottom = Math.min(first.bottom, second.bottom, window.innerHeight);
      return right > left && bottom > top ? { x: left + (right - left) / 2, y: top + (bottom - top) / 2 } : null;
    };
    const overlappingLayerReason = (element) => {
      const targetRect = element.getBoundingClientRect();
      for (const candidate of document.querySelectorAll("*")) {
        // 祖先の背景は上の探索で不透明面まで確定済み。非祖先の描画層は、重なりの有無を安全側で判定する。
        if (candidate === element || candidate.contains(element)) continue;
        const style = getComputedStyle(candidate);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const reason = layerReason(candidate, style);
        if (!reason) continue;
        // center一点では部分的な重なりを見落とす。矩形が交差する画像・blend・描画要素は単色背景と断定しない。
        if (overlapPoint(targetRect, candidate.getBoundingClientRect())) return reason;
      }
      return null;
    };
    const humanReason = (element, includeSelfBackground) => {
      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        const effectReason = layerReason(current, style);
        if (effectReason) return effectReason;
        const opacity = opacityOf(style);
        if (opacity === null) return "color-or-opacity-not-resolved";
        const contributesBackground = includeSelfBackground || current !== element;
        if (!contributesBackground) continue;
        const color = parseColor(style.backgroundColor);
        if (!color) return "color-or-opacity-not-resolved";
        // alpha=1かつopacity=1の背景だけが、より外側の背景を判定領域から遮蔽する。
        if (color.a === 1 && opacity === 1) {
          break;
        }
      }
      return overlappingLayerReason(element);
    };
    const effectiveColors = (element, includeSelfBackground, foreground) => {
      let backgroundContent = { r: 0, g: 0, b: 0, a: 0 };
      let foregroundContent = foreground;
      const opacityChain = [];
      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        const opacity = opacityOf(style);
        if (opacity === null) return null;
        const contributesBackground = includeSelfBackground || current !== element;
        if (contributesBackground) {
          const backgroundColor = parseColor(style.backgroundColor);
          if (!backgroundColor) return null;
          backgroundContent = composite(backgroundContent, backgroundColor);
          foregroundContent = composite(foregroundContent, backgroundColor);
        }
        // UIのbehind比較でも対象自身のopacityは前景へ必ず適用する。
        backgroundContent = { ...backgroundContent, a: backgroundContent.a * opacity };
        foregroundContent = { ...foregroundContent, a: foregroundContent.a * opacity };
        if (opacity < 1) opacityChain.push({ selector: current.id ? "#" + current.id : current.tagName.toLowerCase(), opacity });
      }
      const canvas = { r: 255, g: 255, b: 255, a: 1 };
      return {
        background: composite(backgroundContent, canvas),
        foreground: composite(foregroundContent, canvas),
        opacityChain,
      };
    };
    const toHex = (color) => "#" + [color.r, color.g, color.b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("");
    const results = [];
    for (const target of targets) {
      const elements = Array.from(document.querySelectorAll(target.selector));
      if (elements.length === 0) {
        results.push({ targetId: target.id, selector: target.selector, status: "FAIL", reason: "selector-not-found" });
        continue;
      }
      for (const [index, element] of elements.entries()) {
        const entry = { targetId: target.id, selector: target.selector, index, kind: target.kind };
        if (!visible(element)) {
          entry.status = "HUMAN-REVIEW";
          entry.reason = "target-not-visible";
          results.push(entry);
          continue;
        }
        const includeSelfBackground = target.backgroundScope ? target.backgroundScope === "self" : target.kind === "text";
        const reason = humanReason(element, includeSelfBackground);
        if (reason) {
          entry.status = "HUMAN-REVIEW";
          entry.reason = reason;
          results.push(entry);
          continue;
        }
        const style = getComputedStyle(element);
        const foregroundValue = target.kind === "text" ? style.color : style[target.foregroundProperty];
        const foreground = parseColor(foregroundValue);
        const colors = foreground ? effectiveColors(element, includeSelfBackground, foreground) : null;
        if (!foreground || !colors) {
          entry.status = "HUMAN-REVIEW";
          entry.reason = "color-not-resolved-to-rgba";
          results.push(entry);
          continue;
        }
        const ratio = (Math.max(luminance(colors.foreground), luminance(colors.background)) + 0.05) / (Math.min(luminance(colors.foreground), luminance(colors.background)) + 0.05);
        const fontSize = Number.parseFloat(style.fontSize);
        const fontWeight = style.fontWeight === "bold" || style.fontWeight === "bolder" ? 700 : Number.parseFloat(style.fontWeight);
        const isLarge = target.kind === "text" && (fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700));
        const requiredRatio = target.kind === "ui" ? 3 : isLarge ? 3 : 4.5;
        Object.assign(entry, {
          foreground: toHex(colors.foreground),
          background: toHex(colors.background),
          opacityChain: colors.opacityChain,
          ratio: Number(ratio.toFixed(3)),
          requiredRatio,
          fontSize: target.kind === "text" ? style.fontSize : undefined,
          fontWeight: target.kind === "text" ? style.fontWeight : undefined,
          isLarge: target.kind === "text" ? isLarge : undefined,
          status: ratio >= requiredRatio ? "PASS" : "FAIL",
        });
        results.push(entry);
      }
    }
    return results;
  })()`;
}
async function runContrast(browser, config) {
  // 色検査を止めている案件では計測自体を行わない。ブラウザで測って結果を捨てると、
  // レポートに「測ったが無視した値」が残り、後から読む人が判定を取り違える。
  if (config.colorChecks?.status === "disabled") {
    return { disabled: true, entries: [], approvedExceptions: [], failures: [], humanReview: [] };
  }
  const entries = await browser.evaluate(contrastExpression(config.contrast.targets));
  const approvedExceptions = [];
  const failures = [];
  const humanReview = [];
  for (const entry of entries) {
    if (entry.status === "HUMAN-REVIEW") humanReview.push(entry);
    if (entry.status !== "FAIL") continue;
    const exception = config.contrast.approvedExceptions.find((candidate) => candidate.targetId === entry.targetId);
    if (exception) approvedExceptions.push({ entry, exceptionId: exception.id });
    else failures.push(entry);
  }
  return { entries, approvedExceptions, failures, humanReview };
}

async function collectFocusables(browser) {
  return browser.evaluate(`(() => {
    const selector = ${JSON.stringify(INTERACTIVE_SELECTOR)};
    const isExcluded = (element) => {
      if (element.disabled || element.tabIndex < 0) return true;
      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (current.getAttribute("aria-hidden") === "true" || current.hasAttribute("inert") || style.display === "none" || style.visibility === "hidden") return true;
        if (current.tagName === "DETAILS" && !current.open && element.tagName !== "SUMMARY") return true;
      }
      const rect = element.getBoundingClientRect();
      return rect.width <= 0 || rect.height <= 0;
    };
    const nodes = Array.from(document.querySelectorAll(selector)).filter((element) => !isExcluded(element));
    return nodes.map((element, index) => {
      const id = "a11y-focus-" + index;
      element.dataset.a11yFocusId = id;
      const style = getComputedStyle(element);
      return {
        id,
        tag: element.tagName.toLowerCase(),
        label: (element.getAttribute("aria-label") || element.innerText || element.value || element.href || "").trim().slice(0, 120),
        baseline: {
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          boxShadow: style.boxShadow,
          borderTopColor: style.borderTopColor,
          borderRightColor: style.borderRightColor,
          borderBottomColor: style.borderBottomColor,
          borderLeftColor: style.borderLeftColor,
          backgroundColor: style.backgroundColor,
        },
      };
    });
  })()`);
}

async function scanKeyboard(browser, label) {
  const expected = await collectFocusables(browser);
  await browser.evaluate(`(() => { document.body.tabIndex = -1; document.body.focus(); })()`);
  const reached = [];
  const invisibleFocus = [];
  for (const entry of expected) {
    await dispatchKey(browser, "Tab");
    const focused = await browser.evaluate(`(() => {
      const active = document.activeElement;
      const style = active ? getComputedStyle(active) : null;
      return {
        id: active?.dataset?.a11yFocusId || null,
        style: style ? {
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          boxShadow: style.boxShadow,
          borderTopColor: style.borderTopColor,
          borderRightColor: style.borderRightColor,
          borderBottomColor: style.borderBottomColor,
          borderLeftColor: style.borderLeftColor,
          backgroundColor: style.backgroundColor,
        } : null,
      };
    })()`);
    reached.push(focused?.id ?? null);
    const baseline = expected.find((candidate) => candidate.id === focused?.id)?.baseline;
    if (!baseline || !focused?.style) continue;
    const outlineVisible = focused.style.outlineStyle !== "none" && Number.parseFloat(focused.style.outlineWidth) > 0;
    const alternateVisible = ["boxShadow", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "backgroundColor"]
      .some((key) => baseline[key] !== focused.style[key]);
    if (!outlineVisible && !alternateVisible) invisibleFocus.push({ id: focused.id, baseline, focused: focused.style });
  }
  const expectedIds = expected.map((entry) => entry.id);
  const orderMatches = expectedIds.length === reached.length && expectedIds.every((id, index) => id === reached[index]);
  const unreachable = expected.filter((entry) => !reached.includes(entry.id));
  return { label, expected, reached, orderMatches, unreachable, invisibleFocus };
}

async function readAriaExpanded(browser, selector) {
  return browser.evaluate(`document.querySelector(${JSON.stringify(selector)})?.getAttribute("aria-expanded")`);
}

async function waitForAriaExpanded(browser, selector, expected, timeoutMs = 3000) {
  return waitFor(
    () => browser.evaluate(`(() => document.querySelector(${JSON.stringify(selector)})?.getAttribute("aria-expanded") === ${JSON.stringify(expected)})()`),
    { timeoutMs, label: `${selector} aria-expanded=${expected}` }
  );
}

// 1回のクリックで状態が変わることを前提にしない。
//
// navigateAndWait は document.readyState === "complete" と対象の存在までしか待たない。
// ページのJSがその後にハンドラを装着する作りだと、最初のクリックは装着前に落ちて何も起きない。
// 実測（2026-08-30）: 同じ実装・同じ設定で Q-13 が通ったり落ちたりした。
//
// **押す前に現在値を見るので、二重トグルにはならない。**既に期待値なら押さずに戻る。
// 規定回数押しても変わらなければ、押した回数と最終値を添えて落とす。
// 「状態が変わらない」と「そもそも押せていない」を混同させないため、経過を残す。
async function clickUntilAriaExpanded(browser, selector, expected, { attempts = 3, perAttemptMs = 1500 } = {}) {
  let clicks = 0;
  let last = await readAriaExpanded(browser, selector);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await readAriaExpanded(browser, selector);
    if (last === expected) return { clicks, settled: true };
    await clickSelector(browser, selector);
    clicks += 1;
    try {
      await waitForAriaExpanded(browser, selector, expected, perAttemptMs);
      return { clicks, settled: true };
    } catch {
      last = await readAriaExpanded(browser, selector);
    }
  }
  fail(
    `${selector} did not reach aria-expanded=${expected} after ${clicks} click(s). 最終値=${JSON.stringify(last)}。` +
      " クリックは対象へ届いている（座標のヒットテスト済み）。状態が変わらないなら、" +
      "ハンドラが装着されていないか、トグルが片道である。"
  );
  return { clicks, settled: false };
}

async function waitForVisibility(browser, selector, visible) {
  return waitFor(
    () => browser.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return ${visible ? "style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0" : "style.display === 'none' || style.visibility === 'hidden' || element.hidden"};
    })()`),
    { timeoutMs: 3000, label: `${selector} visibility=${visible}` }
  );
}

// aria-expanded を持つ操作要素は stateFlow で宣言させる。ただし要求するのは
// **測定viewportで実際に操作できる要素だけ** とする。
//
// 2026-08-25 実測：レスポンシブの共有ヘッダーはSP専用のハンバーガー
// （aria-controls / aria-expanded 付き）を持つ。PC幅で測定する config では、この要素は
// display:none で描画されないため triggerSelector として宣言できない
// （navigateAndWait の測定ルート待ちが60秒でタイムアウトし、スキャン全体が落ちる）。
// 一方この関数はDOM全体から [aria-expanded] を拾うため、宣言できない要素の宣言を要求していた。
// 要求と宣言可能性が矛盾し、viewportで出し分ける共有部品を持つページは構造的に合格できなかった。
//
// したがって描画されていない要素（display:none / detached / visibility:hidden /
// hidden属性 / inert配下）は対象外にする。閉じたアコーディオンのように、
// 測定viewportで見えている操作要素は従来どおり宣言が必須である。
async function ensureStateFlowCoverage(browser, stateFlows) {
  const missing = await browser.evaluate(`(() => {
    const selectors = ${JSON.stringify(stateFlows.map((flow) => flow.triggerSelector))};
    function operableHere(element) {
      // display:none と detached はレイアウトボックスを持たない。
      if (element.getClientRects().length === 0) return false;
      if (element.closest("[inert]") !== null) return false;
      for (let node = element; node instanceof Element; node = node.parentElement) {
        if (node.hasAttribute("hidden")) return false;
        const style = getComputedStyle(node);
        if (style.visibility === "hidden" || style.visibility === "collapse") return false;
        if (style.contentVisibility === "hidden") return false;
      }
      return true;
    }
    return Array.from(document.querySelectorAll("[aria-expanded]"))
      .filter((element) => operableHere(element))
      .filter((element) => !selectors.some((selector) => element.matches(selector)))
      .map((element) => element.outerHTML.slice(0, 200));
  })()`);
  return missing;
}

async function ensureDialogCoverage(browser, dialogs) {
  const missing = await browser.evaluate(`(() => {
    const selectors = ${JSON.stringify(dialogs.map((dialog) => dialog.dialogSelector))};
    return Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]')).filter((element) => !selectors.some((selector) => element.matches(selector))).map((element) => element.outerHTML.slice(0, 200));
  })()`);
  return missing;
}

// 開閉の手順は初期状態から決める。「閉じた状態から開く」を固定手順にしない。
//
// 旧実装は before を読んでいながら使わず、必ず「click → true を待つ → click → false を待つ」
// を踏んでいた。そのため**初期展開済み（aria-expanded="true"）の要素を検証できない**。
// 最初のclickで閉じるので、"true" を待つ側がタイムアウトする。
//
// 実測（2026-08-29、rpa-technologies-theme）: 共有検索アコーディオンの先頭グループは
// `search-controls.php` が `aria-expanded="true"` と `is-open` を出力する**意図的な初期展開**で、
// ページ側は正しい。それでもQ-13がここで停止し、実装側を直す理由が無いまま作業が止まった。
// 検証器が実装の正当な設計を検証できないのは、検証器の欠陥である。
//
// closed / open は「何番目に測ったか」ではなく「実際にどちらの状態か」で返す。
// 呼び出し側の合否判定（keyboardFailures）は状態の意味に依存するため、ここを入れ替えない。
async function runStateFlow(browser, config, flow) {
  await navigateAndWait(browser, { url: config.url, width: config.viewport.width, height: config.viewport.height, scrollbars: config.viewportPolicy.scrollbars, selectors: [flow.triggerSelector] });
  const before = await browser.evaluate(`document.querySelector(${JSON.stringify(flow.triggerSelector)})?.getAttribute("aria-expanded")`);
  if (before !== "true" && before !== "false") {
    throw new Error(
      `stateFlow ${flow.name}: ${flow.triggerSelector} の初期 aria-expanded が "true"/"false" ではありません（実測: ${JSON.stringify(before)}）。` +
        " 開閉状態を持つ操作要素には、初期状態を aria-expanded で明示する。"
    );
  }

  const startsExpanded = before === "true";
  const afterFirstClick = startsExpanded ? "false" : "true";
  const afterSecondClick = startsExpanded ? "true" : "false";

  const initialScan = await scanKeyboard(browser, `${flow.name}:${startsExpanded ? "open" : "closed"}`);
  const firstToggle = await clickUntilAriaExpanded(browser, flow.triggerSelector, afterFirstClick);
  const toggledScan = await scanKeyboard(browser, `${flow.name}:${startsExpanded ? "closed" : "open"}`);
  // 2回目のtoggleで初期状態へ戻る。戻らないならトグルが片道であり、それ自体が欠陥である。
  const secondToggle = await clickUntilAriaExpanded(browser, flow.triggerSelector, afterSecondClick);

  return {
    name: flow.name,
    triggerSelector: flow.triggerSelector,
    before,
    startsExpanded,
    // クリック回数を証跡へ残す。1回で決まらなかった場合、ページ側のハンドラ装着が
    // readyState complete より後だったことを意味する。後から原因を辿れるようにする。
    clicks: { toOpposite: firstToggle.clicks, backToInitial: secondToggle.clicks },
    closed: startsExpanded ? toggledScan : initialScan,
    open: startsExpanded ? initialScan : toggledScan,
  };
}

async function runDialogFlow(browser, config, dialog) {
  await navigateAndWait(browser, { url: config.url, width: config.viewport.width, height: config.viewport.height, scrollbars: config.viewportPolicy.scrollbars, selectors: [dialog.triggerSelector] });
  const closed = await scanKeyboard(browser, `${dialog.name}:closed`);
  await clickSelector(browser, dialog.triggerSelector);
  await waitForVisibility(browser, dialog.dialogSelector, true);
  const focusedInside = await browser.evaluate(`(() => {
    const dialog = document.querySelector(${JSON.stringify(dialog.dialogSelector)});
    return Boolean(dialog && dialog.contains(document.activeElement));
  })()`);
  const open = await scanKeyboard(browser, `${dialog.name}:open`);
  const lastFocused = await browser.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(dialog.lastSelector)}); el?.focus(); return document.activeElement === el; })()`);
  await dispatchKey(browser, "Tab");
  const wrapsForward = await browser.evaluate(`document.activeElement === document.querySelector(${JSON.stringify(dialog.firstSelector)})`);
  const firstFocused = await browser.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(dialog.firstSelector)}); el?.focus(); return document.activeElement === el; })()`);
  await dispatchKey(browser, "Tab", true);
  const wrapsBackward = await browser.evaluate(`document.activeElement === document.querySelector(${JSON.stringify(dialog.lastSelector)})`);
  await dispatchKey(browser, "Escape");
  await waitForVisibility(browser, dialog.dialogSelector, false);
  const focusRestored = await browser.evaluate(`document.activeElement === document.querySelector(${JSON.stringify(dialog.triggerSelector)})`);
  return { name: dialog.name, dialogSelector: dialog.dialogSelector, closed, open, focusedInside, lastFocused, wrapsForward, firstFocused, wrapsBackward, focusRestored };
}

function keyboardFailures(scan) {
  const failures = [];
  if (!scan.orderMatches) failures.push({ type: "tab-order-mismatch", scan });
  if (scan.unreachable.length) failures.push({ type: "unreachable-focusable", scan });
  if (scan.invisibleFocus.length) failures.push({ type: "focus-indicator-missing", scan });
  return failures;
}

async function runKeyboard(browser, config) {
  await navigateAndWait(browser, { url: config.url, width: config.viewport.width, height: config.viewport.height, scrollbars: config.viewportPolicy.scrollbars });
  const uncoveredAriaExpanded = await ensureStateFlowCoverage(browser, config.keyboard.stateFlows);
  const uncoveredDialogs = await ensureDialogCoverage(browser, config.keyboard.dialogs);
  const defaultScan = await scanKeyboard(browser, "default");
  const stateFlows = [];
  for (const flow of config.keyboard.stateFlows) stateFlows.push(await runStateFlow(browser, config, flow));
  const dialogs = [];
  for (const dialog of config.keyboard.dialogs) dialogs.push(await runDialogFlow(browser, config, dialog));
  const failures = [...keyboardFailures(defaultScan)];
  for (const flow of stateFlows) {
    // 初期値が "false" でないことは欠陥ではない。初期展開済みのアコーディオンは正当な設計で、
    // 案件の共有検索アコーディオンが実際にその形である（search-controls.php）。
    // ここで要求すべきは「初期状態が aria-expanded で明示されていること」であり、
    // どちらの値かではない。値そのものは runStateFlow が "true"/"false" 以外を弾いている。
    if (flow.before !== "true" && flow.before !== "false") {
      failures.push({ type: "aria-expanded-missing-initial-state", flow: flow.name, actual: flow.before });
    }
    failures.push(...keyboardFailures(flow.closed), ...keyboardFailures(flow.open));
  }
  for (const dialog of dialogs) {
    failures.push(...keyboardFailures(dialog.closed), ...keyboardFailures(dialog.open));
    if (!dialog.focusedInside || !dialog.lastFocused || !dialog.wrapsForward || !dialog.firstFocused || !dialog.wrapsBackward || !dialog.focusRestored) {
      failures.push({ type: "modal-focus-trap-or-escape-failed", dialog });
    }
  }
  if (uncoveredAriaExpanded.length) failures.push({ type: "aria-expanded-control-not-covered", controls: uncoveredAriaExpanded });
  if (uncoveredDialogs.length) failures.push({ type: "modal-dialog-not-covered", dialogs: uncoveredDialogs });
  return { defaultScan, stateFlows, dialogs, uncoveredAriaExpanded, uncoveredDialogs, failures };
}

function prepareAccessibilityConfig(config, url, projectRoot) {
  const validated = validateConfig(config, projectRoot);
  validated.url = requireString(url || validated.url, "config.url");
  validated.viewport = { width: Number(validated.viewport?.width || 1440), height: Number(validated.viewport?.height || 1600) };
  if (!Number.isInteger(validated.viewport.width) || !Number.isInteger(validated.viewport.height) || validated.viewport.width <= 0 || validated.viewport.height <= 0) {
    fail("config.viewport.width and config.viewport.height must be positive integers.");
  }
  return validated;
}

async function executeAccessibilityInBrowser({ browser, validated, reportPath, projectRoot }) {
  const report = {
    version: 1,
    url: validated.url,
    generatedAt: new Date().toISOString(),
    browserSessionId: browser.sessionId,
    browserPid: browser.browserPid,
    colorChecks: validated.colorChecks,
    axe: null,
    contrast: null,
    keyboard: null,
    failures: [],
    humanReview: [],
  };
  try {
    await navigateAndWait(browser, { url: validated.url, width: validated.viewport.width, height: validated.viewport.height, scrollbars: validated.viewportPolicy.scrollbars });
    report.axe = await injectAndRunAxe(browser, validated);
    report.contrast = await runContrast(browser, validated);
    report.keyboard = await runKeyboard(browser, validated);
    report.failures.push(...report.axe.unapprovedViolations.map((entry) => ({ type: "axe-violation", ...entry })));
    report.failures.push(...report.contrast.failures.map((entry) => ({ type: "contrast-failure", ...entry })));
    report.failures.push(...report.keyboard.failures.map((entry) => ({ type: "keyboard-failure", ...entry })));
    report.humanReview.push(...report.contrast.humanReview);
  } catch (error) {
    report.failures.push({ type: "runtime-error", message: error.message });
  }

  const outputPath = reportPath ? resolveProjectPath(projectRoot, reportPath, "reportPath") : resolveProjectPath(projectRoot, validated.reportPath || "MyBrain/verify/reports/accessibility.json", "config.reportPath");
  writeJson(outputPath, report);
  return { report, reportPath: outputPath, validated };
}

// figma-gate のPC/SP batchから渡されたbrowserを所有しない。別Chromeを起動しない。
export async function runAccessibilityVerificationInBrowser({ browser, config, url, reportPath, projectRoot = process.cwd() }) {
  if (!browser || typeof browser.send !== "function") fail("browser must be a live CDP session.");
  const validated = prepareAccessibilityConfig(config, url, projectRoot);
  return executeAccessibilityInBrowser({ browser, validated, reportPath, projectRoot });
}

export async function runAccessibilityVerification({ config, url, reportPath, projectRoot = process.cwd() }) {
  const validated = prepareAccessibilityConfig(config, url, projectRoot);
  const browser = await startCdpBrowser({ initialWidth: validated.viewport.width, initialHeight: validated.viewport.height, scrollbars: validated.viewportPolicy.scrollbars });
  try {
    return await executeAccessibilityInBrowser({ browser, validated, reportPath, projectRoot });
  } finally {
    await browser.close();
  }
}

async function main() {
  const [configArg, urlArg, reportArg] = process.argv.slice(2);
  if (!configArg) fail("Usage: node MyBrain/verify/accessibility-verify.mjs <config.json> [url] [report.json]");
  const projectRoot = process.cwd();
  const configPath = resolveProjectPath(projectRoot, configArg, "config path");
  const config = readJson(configPath, "Accessibility config");
  const { report, reportPath } = await runAccessibilityVerification({ config, url: urlArg, reportPath: reportArg, projectRoot });
  // 色検査の停止は、結果を読む人が必ず気づく位置に出す。レポートの奥だけに置かない。
  if (report.colorChecks?.status === "disabled") {
    console.log(
      `ACCESSIBILITY: 色に関する検査を停止しています（オーナー承認: ${report.colorChecks.ownerApproval.by} / 根拠: ${report.colorChecks.specPath}）。\n` +
      `  停止したaxeルール: ${report.colorChecks.disabledRuleIds.join(", ")}\n` +
      `  この実行で無視した色の違反: ${report.axe?.colorChecksDisabled?.skippedNodeCount ?? 0} 件\n` +
      `  色以外の検査は通常どおり実行しています。`
    );
  }
  console.log(JSON.stringify({
    status: report.failures.length === 0 ? "PASS" : "FAIL",
    reportPath,
    failures: report.failures.length,
    humanReview: report.humanReview.length,
    axeViolations: report.axe?.unapprovedViolations.length ?? 0,
    colorChecks: report.colorChecks?.status ?? "enabled",
    colorViolationsIgnored: report.axe?.colorChecksDisabled?.skippedNodeCount ?? 0,
  }, null, 2));
  process.exitCode = report.failures.length === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}