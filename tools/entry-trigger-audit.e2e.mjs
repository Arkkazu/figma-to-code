#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_DOCUMENTS,
  INTENT_PHRASES,
  NARROW_TRIGGERS,
  UPSTREAM_DOCUMENT,
  auditDocument,
  runAudit,
  runCli,
  stripQuotedLines,
} from "./entry-trigger-audit.mjs";

const TOOL_PATH = fileURLToPath(new URL("./entry-trigger-audit.mjs", import.meta.url));

// 契約を満たす最小の入口本文。実ファイルの文言に依存させない。
const CONTRACT_BODY = [
  "# 入口",
  "",
  "**Figmaをデザイン根拠とする実装・修正・再現・コーディングの依頼**では、着手前ゲートの5点を報告するまで**ソースを1行も編集しません**。",
  "",
  `**Figma URLが会話に出ているかどうかで判定しません。**${INTENT_PHRASES.join("")}、およびFigmaで設計された画面・コンポーネントの新規実装や見た目の修正は、すべてこれに当たります。判断に迷う依頼は、着手前ゲートを実行する側に倒します。`,
  "",
].join("\n");

// 上位層は契約の全文を持たない。狭窄の禁止とURL非依存だけを課す。
const UPSTREAM_BODY = [
  "# Web Development",
  "",
  "5. **Figmaをデザイン根拠とする実装・修正・再現・コーディングの依頼**では、追加でFigma固有規則。**Figma URLが会話に出ているかどうかで判定しない。**",
  "",
].join("\n");

// --- auditDocument 単体 -------------------------------------------------

assert.deepEqual(auditDocument(CONTRACT_BODY, { requireContract: true }), [], "契約を満たす本文はfindingを出さない");
assert.deepEqual(auditDocument(UPSTREAM_BODY, { requireContract: false }), [], "上位層は契約全文を要求されない");

// 上位層の本文を「契約全文を持つ文書」として検査すると落ちる（要求の切り分けが効いている）
assert.ok(
  auditDocument(UPSTREAM_BODY, { requireContract: true }).some((f) => f.rule === "intent-phrase"),
  "契約全文を課す側では意図の例示欠落を検出する",
);

// 狭い発火条件の再導入を、3形すべてで落とす
for (const narrow of NARROW_TRIGGERS) {
  const regressed = `${CONTRACT_BODY}\n${narrow}の実装・修正では、ゲートを実行します。\n`;
  const findings = auditDocument(regressed, { requireContract: true });
  assert.ok(
    findings.some((f) => f.rule === "narrow-trigger" && f.detail.includes(narrow)),
    `狭い発火条件「${narrow}」の再導入を検出する`,
  );
}

// 履歴calloutの引用は現行契約と誤認しない（2026-08-29のcalloutが常時FAILを起こさない）
const withHistoricalCallout = [
  CONTRACT_BODY,
  "> [!important] 狭い発火条件が実害を出した（2026-08-29）",
  "> 旧文は「Figma URLや『デザインどおりに直して』という依頼」と書いていた。",
  "> Figma URL付きの実装・修正では、という表現も同じ欠陥である。",
  "",
].join("\n");
assert.deepEqual(
  auditDocument(withHistoricalCallout, { requireContract: true }),
  [],
  "引用行に残る旧文をFAILにしない",
);
assert.ok(
  !stripQuotedLines(withHistoricalCallout).includes("Figma URLや"),
  "stripQuotedLinesが引用行を落とす",
);

// 引用の中にしか契約が無い状態は満たしたことにしない
const contractOnlyInQuote = ["# 入口", "", ...CONTRACT_BODY.split("\n").map((l) => `> ${l}`), ""].join("\n");
assert.ok(
  auditDocument(contractOnlyInQuote, { requireContract: true }).length > 0,
  "引用の中だけに契約がある本文をPASSさせない",
);

// URL非依存の宣言を削ると落ちる
const withoutUrlIndependence = CONTRACT_BODY.replace(
  "**Figma URLが会話に出ているかどうかで判定しません。**",
  "",
);
assert.ok(
  auditDocument(withoutUrlIndependence, { requireContract: true }).some((f) => f.rule === "url-independence"),
  "URL非依存の宣言の削除を検出する",
);
assert.ok(
  auditDocument(withoutUrlIndependence, { requireContract: false }).some((f) => f.rule === "url-independence"),
  "上位層でもURL非依存の宣言は必須",
);

// 意図の例示を1つ削るだけで落ちる（列挙の再狭窄を許さない）
for (const phrase of INTENT_PHRASES) {
  const narrowed = CONTRACT_BODY.replace(phrase, "");
  const findings = auditDocument(narrowed, { requireContract: true });
  assert.ok(
    findings.some((f) => f.rule === "intent-phrase" && f.detail.includes(phrase)),
    `意図の例示「${phrase}」の削除を検出する`,
  );
}

// 「迷ったらゲートへ倒す」既定を削ると落ちる
const withoutAmbiguityDefault = CONTRACT_BODY.replace(
  "判断に迷う依頼は、着手前ゲートを実行する側に倒します。",
  "",
);
assert.ok(
  auditDocument(withoutAmbiguityDefault, { requireContract: true }).some((f) => f.rule === "ambiguity-default"),
  "「迷ったらゲートへ倒す」既定の削除を検出する",
);

// --- runAudit（文書集合） -----------------------------------------------

// resolve() の結果はプラットフォームで変わる（Windowsでは C:\repo\... になる）。
// 検査器と同じ resolve を使って絶対パスの鍵を作り、厳密一致で引く。
// 末尾一致にすると、上位層を消したときに同名の WORKFLOW.md を拾って
// 「読めた」ことになってしまう（実際にそれで負のケースが素通りした）。
const FIXTURE_ROOT = "/repo";
const norm = (p) => resolve(p).replace(/\\/g, "/");
const canonicalKey = (relativePath) => norm(resolve(FIXTURE_ROOT, relativePath));
const UPSTREAM_KEY = norm(UPSTREAM_DOCUMENT.defaultPath);

const files = new Map();
const resetFiles = () => {
  files.clear();
  for (const doc of CANONICAL_DOCUMENTS) files.set(canonicalKey(doc.path), CONTRACT_BODY);
  files.set(UPSTREAM_KEY, UPSTREAM_BODY);
};
const setDoc = (relativePath, body) => files.set(canonicalKey(relativePath), body);
const deps = () => ({
  root: FIXTURE_ROOT,
  env: {},
  readPath: (p) => {
    const value = files.get(norm(p));
    if (value === undefined) throw new Error(`ENOENT ${p}`);
    return value;
  },
  exists: (p) => files.has(norm(p)),
});

resetFiles();
assert.equal(runAudit(deps()).ok, true, "契約を満たす文書集合はPASSする");

// 入口2枚の片方だけを更新すると落ちる（テンプレートだけ直してrootが残る、を再発させない）
resetFiles();
setDoc("AGENTS.md", `${CONTRACT_BODY}\n追記。\n`);
const drift = runAudit(deps());
assert.equal(drift.ok, false, "AGENTS.md と CLAUDE.md の乖離を落とす");
assert.ok(
  drift.documents.some((d) => d.findings.some((f) => f.rule === "entry-pair-drift")),
  "乖離をentry-pair-driftとして報告する",
);

// 1文書だけ狭窄しても全体が落ちる
resetFiles();
setDoc("templates/project-entry.md", `${CONTRACT_BODY}\nFigma URL付きの実装では、ゲートを実行します。\n`);
assert.equal(runAudit(deps()).ok, false, "テンプレートだけの狭窄も落とす");

// 上位層を読めないとき、既定はFAIL（fail-open にしない）
resetFiles();
files.delete(UPSTREAM_KEY);
const missingUpstream = runAudit(deps());
assert.equal(missingUpstream.ok, false, "上位層を読めない場合は既定でFAILする");
assert.ok(
  missingUpstream.documents.some((d) => d.findings.some((f) => f.rule === "upstream-unreadable")),
  "読めない理由をupstream-unreadableとして報告する",
);
assert.equal(
  runAudit({ ...deps(), skipMissingUpstream: true }).ok,
  true,
  "--skip-missing-upstream を明示したときだけskipする",
);

// envKey で上位層の位置を差し替えられる
resetFiles();
files.delete(UPSTREAM_KEY);
files.set(norm("/elsewhere/upstream-WORKFLOW.md"), UPSTREAM_BODY);
assert.equal(
  runAudit({ ...deps(), env: { [UPSTREAM_DOCUMENT.envKey]: "/elsewhere/upstream-WORKFLOW.md" } }).ok,
  true,
  "envKeyで上位層の位置を上書きできる",
);

// --- CLI -----------------------------------------------------------------

resetFiles();
const okCli = runCli([], deps());
assert.equal(okCli.exitCode, 0, "PASS時はexit 0");
assert.match(okCli.stdout, /ENTRY TRIGGER AUDIT: PASS/, "PASS行を出す");

resetFiles();
setDoc("WORKFLOW.md", `${CONTRACT_BODY}\nFigma URLやデザイン修正の依頼では、ゲートを実行します。\n`);
const failCli = runCli([], deps());
assert.equal(failCli.exitCode, 1, "FAIL時はexit 1");
assert.match(failCli.stdout, /ENTRY TRIGGER AUDIT: FAIL/, "FAIL行を出す");
assert.match(failCli.stderr, /経路情報/, "なぜ入口が発火条件を持つのかを出力で説明する");

assert.equal(runCli(["--nope"], deps()).exitCode, 64, "不明な引数はexit 64");

// 実プロセスで現物を検査する。
// クラウドセッションには上位層（C:\AI\web-development）が存在しない
// （WORKFLOW.md「クラウドセッションでの実行範囲」）。CIもこの条件で動く。
// 上位層を読めるかどうかで期待値を変え、どちらの環境でも意味のある検査にする。
const upstreamPath = process.env[UPSTREAM_DOCUMENT.envKey] || UPSTREAM_DOCUMENT.defaultPath;
const upstreamReadable = existsSync(upstreamPath);
const realRun = spawnSync(
  process.execPath,
  upstreamReadable ? [TOOL_PATH] : [TOOL_PATH, "--skip-missing-upstream"],
  { encoding: "utf8" },
);
assert.equal(
  realRun.status,
  0,
  `現物の入口が契約を満たす (${realRun.stdout ?? ""}${realRun.stderr ?? ""})`,
);
assert.match(realRun.stdout, /ENTRY TRIGGER AUDIT: PASS 5 document\(s\)/, "現物5文書がPASSする");

if (upstreamReadable) {
  // 上位層を読める環境で skip してはならない。読めるのに skip して通す取り違えを塞ぐ。
  assert.ok(!realRun.stdout.includes("(skipped)"), "上位層を読める環境で skip してはならない");
} else {
  assert.match(realRun.stdout, /web-development-workflow.*\(skipped\)/, "上位層不在時は skipped と明示する");
  // 上位層不在でフラグを付けなければ落ちること（fail-open にしていないこと）を固定する。
  const withoutFlag = spawnSync(process.execPath, [TOOL_PATH], { encoding: "utf8" });
  assert.equal(withoutFlag.status, 1, "上位層不在でフラグ無しなら落ちる");
  assert.match(withoutFlag.stdout, /upstream-unreadable/, "落ちた理由を名乗る");
}

process.stdout.write("entry-trigger-audit.e2e: PASS\n");
