#!/usr/bin/env node

// 入口の発火条件（どの規則へ入るかの経路情報）が、正本と同じ意図ベース契約に
// なっていることを機械で確かめる。
//
// 2026-08-29 実測：入口が「Figma URLや『デザインどおりに直して』という依頼」という
// 閉じた許可リストだったため、「Figmaデザインを実装して」で着手前ゲートを通らず
// コード編集へ進む経路が残っていた。テンプレートだけ新条件へ更新され、
// root入口とWeb正本が取り残されていた（乖離が誰にも検出されなかった）。
//
// 入口は規則本文を複製しない。しかし発火条件は「規則本文」ではなく「経路情報」であり、
// これを持たない入口は入口として機能しない。複製が危険なのは乖離が silent なときだけなので、
// 複製を消すのではなく、この検査器で乖離を落とす。

import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 意図ベース契約の構成要素。文言そのものではなく、契約として欠けてはならない要素で検査する。
export const INTENT_PHRASES = Object.freeze([
  "「Figmaデザインを実装して」",
  "「Figmaどおりにコーディングして」",
  "「このFigmaを再現して」",
  "「デザインどおりに直して」",
  "「デザインと違う」",
]);

// URLの有無で判定しないという宣言。正本とテンプレートで語尾が違うため両方を受ける。
export const URL_INDEPENDENCE =
  /Figma\s*URL\s*(の有無ではなく依頼の意図で判定|が会話に出ているかどうかで判定し(ない|ません))/;

// 迷ったらゲート側へ倒す既定。これが無いと、広い列挙も「該当しないと判断した」で抜けられる。
//
// 検査するのは「不確かなときゲート側へ倒す」という契約要素であって、特定の言い回しではない。
// 2026-09-02 実測: 別担当が入口を「Figma専用」から「全Web編集の開始ゲート」へ広げる
// 正当な改善（fea2918）を入れたところ、既定は
// 「Figma由来か判断できない依頼は、Figma側へ倒します」という別表現で残っていたのに、
// ここが「判断に迷う依頼は」の1形だけを見ていたため FAIL にした。
// **検査器が他担当の正当な変更を止めた。**言い回しを1つに固定しない。
export const AMBIGUITY_DEFAULT = /(判断に迷う|判断できない|判断がつかない|迷った)[^。]*倒(す|します)/;

// 旧い狭い発火条件。引用（履歴callout）の外に現れたらFAILとする。
export const NARROW_TRIGGERS = Object.freeze([
  "Figma URLや",
  "Figma URL付き",
  "Figma URLを根拠に",
]);

// 契約の全文を持つ文書。入口とその正本。
export const CANONICAL_DOCUMENTS = Object.freeze([
  { id: "agents", path: "AGENTS.md" },
  { id: "claude", path: "CLAUDE.md" },
  { id: "project-entry-template", path: "templates/project-entry.md" },
  { id: "figma-workflow", path: "WORKFLOW.md" },
]);

// 上位層。契約の全文は持たないが、狭い条件でFigma規則を分岐してはならない。
export const UPSTREAM_DOCUMENT = Object.freeze({
  id: "web-development-workflow",
  defaultPath: "C:\\AI\\web-development\\WORKFLOW.md",
  envKey: "FIGMA_TO_CODE_WEB_DEVELOPMENT_WORKFLOW",
});

// バイト一致を保つ組。入口2枚は同一内容で配られる。
export const IDENTICAL_PAIRS = Object.freeze([["AGENTS.md", "CLAUDE.md"]]);

// 履歴calloutは「旧文はこう書いていた」を引用するため、そのまま禁止語検査に掛けると
// 必ず落ちる。引用行を外してから禁止語を見る。要求語の検査は引用を外さない
// （引用の中にしか契約が無い、という状態を許さないため、要求語は本文行だけで数える）。
export function stripQuotedLines(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line))
    .join("\n");
}

export function auditDocument(text, { requireContract }) {
  const body = stripQuotedLines(text);
  const findings = [];

  for (const phrase of NARROW_TRIGGERS) {
    if (body.includes(phrase)) {
      findings.push({
        rule: "narrow-trigger",
        detail: `狭い発火条件が本文に残っている: ${phrase}`,
      });
    }
  }

  if (!URL_INDEPENDENCE.test(body)) {
    findings.push({
      rule: "url-independence",
      detail: "「Figma URLの有無で判定しない」という宣言が本文に無い。",
    });
  }

  if (requireContract) {
    for (const phrase of INTENT_PHRASES) {
      if (!body.includes(phrase)) {
        findings.push({ rule: "intent-phrase", detail: `意図の例示が欠けている: ${phrase}` });
      }
    }
    if (!AMBIGUITY_DEFAULT.test(body)) {
      findings.push({
        rule: "ambiguity-default",
        detail: "「判断に迷う依頼はゲートを実行する側に倒す」が本文に無い。",
      });
    }
  }

  return findings;
}

function readOrNull(path, readPath) {
  try {
    return readPath(path);
  } catch {
    return null;
  }
}

export function runAudit({
  env = process.env,
  root = REPO_ROOT,
  readPath = (p) => readFileSync(p, "utf8"),
  exists = existsSync,
  skipMissingUpstream = false,
} = {}) {
  const documents = [];

  for (const doc of CANONICAL_DOCUMENTS) {
    const absolute = resolve(root, doc.path);
    const text = readOrNull(absolute, readPath);
    if (text === null) {
      documents.push({ id: doc.id, path: absolute, status: "missing", findings: [] });
      continue;
    }
    documents.push({
      id: doc.id,
      path: absolute,
      status: "read",
      findings: auditDocument(text, { requireContract: true }),
    });
  }

  const upstreamPath = env[UPSTREAM_DOCUMENT.envKey] || UPSTREAM_DOCUMENT.defaultPath;
  const upstreamText = exists(upstreamPath) ? readOrNull(upstreamPath, readPath) : null;
  if (upstreamText === null) {
    documents.push({
      id: UPSTREAM_DOCUMENT.id,
      path: upstreamPath,
      status: skipMissingUpstream ? "skipped" : "missing",
      findings: skipMissingUpstream
        ? []
        : [
            {
              rule: "upstream-unreadable",
              detail:
                "上位層のWeb正本を読めない。クラウドセッションで意図的に読めない場合だけ --skip-missing-upstream を付ける。",
            },
          ],
    });
  } else {
    documents.push({
      id: UPSTREAM_DOCUMENT.id,
      path: upstreamPath,
      status: "read",
      // 上位層は契約の全文を持たない（Figma正本を指す1行）。狭窄の禁止とURL非依存だけを課す。
      findings: auditDocument(upstreamText, { requireContract: false }),
    });
  }

  const pairs = [];
  for (const [left, right] of IDENTICAL_PAIRS) {
    const a = readOrNull(resolve(root, left), readPath);
    const b = readOrNull(resolve(root, right), readPath);
    const identical = a !== null && b !== null && a === b;
    pairs.push({ left, right, identical });
    if (!identical) {
      documents.push({
        id: "identical-pair",
        path: `${left} / ${right}`,
        status: "read",
        findings: [{ rule: "entry-pair-drift", detail: `${left} と ${right} の内容が一致しない。` }],
      });
    }
  }

  const findingCount = documents.reduce((total, doc) => total + doc.findings.length, 0);
  return { ok: findingCount === 0, findingCount, documents, pairs };
}

export function runCli(argv, deps = {}) {
  const skipMissingUpstream = argv.includes("--skip-missing-upstream");
  const unknown = argv.filter((arg) => arg !== "--skip-missing-upstream");
  if (unknown.length > 0) {
    return { exitCode: 64, stdout: "", stderr: `unknown argument: ${unknown[0]}\n` };
  }

  const result = runAudit({ ...deps, skipMissingUpstream });
  const lines = [];
  for (const doc of result.documents) {
    const mark = doc.findings.length === 0 ? "OK  " : "FAIL";
    lines.push(`${mark} ${doc.id}  ${doc.path}${doc.status === "skipped" ? "  (skipped)" : ""}`);
    for (const finding of doc.findings) lines.push(`       [${finding.rule}] ${finding.detail}`);
  }
  lines.push(
    result.ok
      ? `ENTRY TRIGGER AUDIT: PASS ${result.documents.length} document(s)`
      : `ENTRY TRIGGER AUDIT: FAIL ${result.findingCount} finding(s)`,
  );

  const stdout = `${lines.join("\n")}\n`;
  if (result.ok) return { exitCode: 0, stdout, stderr: "" };
  return {
    exitCode: 1,
    stdout,
    stderr:
      "入口の発火条件が正本と一致しない。入口は規則本文を複製しないが、発火条件は経路情報であり入口の責務である。\n" +
      "狭い条件へ戻す変更と、片方だけの更新を許さない。`templates/project-entry.md` の文言へ揃えること。\n",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { exitCode, stdout, stderr } = runCli(process.argv.slice(2));
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  process.exit(exitCode);
}
