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

async function clickSelector(browser, selector) {
  const point = await browser.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return { error: "not-found" };
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (rect.width <= 0 || rect.height <= 0 || style.display === "none" || style.visibility === "hidden") return { error: "not-visible" };
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
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

function validateConfig(raw, projectRoot) {
  const config = requireObject(raw, "config");
  const viewportPolicy = requireObject(config.viewportPolicy, "config.viewportPolicy");
  if (viewportPolicy.scrollbars !== "hidden" && viewportPolicy.scrollbars !== "visible") {
    fail('config.viewportPolicy.scrollbars must be "hidden" or "visible".');
  }

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
  if (targets.length === 0) fail("config.contrast.targets must contain every machine-verifiable text/UI contrast target.");
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

  const approved = [];
  const unapproved = [];
  for (const violation of result.violations || []) {
    for (const node of violation.nodes || []) {
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

async function waitForAriaExpanded(browser, selector, expected) {
  return waitFor(
    () => browser.evaluate(`(() => document.querySelector(${JSON.stringify(selector)})?.getAttribute("aria-expanded") === ${JSON.stringify(expected)})()`),
    { timeoutMs: 3000, label: `${selector} aria-expanded=${expected}` }
  );
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

async function ensureStateFlowCoverage(browser, stateFlows) {
  const missing = await browser.evaluate(`(() => {
    const selectors = ${JSON.stringify(stateFlows.map((flow) => flow.triggerSelector))};
    return Array.from(document.querySelectorAll("[aria-expanded]")).filter((element) => !selectors.some((selector) => element.matches(selector))).map((element) => element.outerHTML.slice(0, 200));
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

async function runStateFlow(browser, config, flow) {
  await navigateAndWait(browser, { url: config.url, width: config.viewport.width, height: config.viewport.height, scrollbars: config.viewportPolicy.scrollbars, selectors: [flow.triggerSelector] });
  const before = await browser.evaluate(`document.querySelector(${JSON.stringify(flow.triggerSelector)})?.getAttribute("aria-expanded")`);
  const closed = await scanKeyboard(browser, `${flow.name}:closed`);
  await clickSelector(browser, flow.triggerSelector);
  await waitForAriaExpanded(browser, flow.triggerSelector, "true");
  const open = await scanKeyboard(browser, `${flow.name}:open`);
  await clickSelector(browser, flow.triggerSelector);
  await waitForAriaExpanded(browser, flow.triggerSelector, "false");
  return { name: flow.name, triggerSelector: flow.triggerSelector, before, closed, open };
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
    if (flow.before !== "false") failures.push({ type: "aria-expanded-not-false-when-closed", flow: flow.name, actual: flow.before });
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
  console.log(JSON.stringify({ status: report.failures.length === 0 ? "PASS" : "FAIL", reportPath, failures: report.failures.length, humanReview: report.humanReview.length, axeViolations: report.axe?.unapprovedViolations.length ?? 0 }, null, 2));
  process.exitCode = report.failures.length === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}