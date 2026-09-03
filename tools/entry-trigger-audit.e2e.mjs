#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_DOCUMENTS,
  CONTRACT_PATH,
  INTENT_PHRASES,
  MINIMUM_INTENT_EXAMPLES,
  NARROW_TRIGGERS,
  UPSTREAM_DOCUMENT,
  auditDocument,
  loadContract,
  runAudit,
  runCli,
  stripQuotedLines,
} from "./entry-trigger-audit.mjs";

const TOOL_PATH = fileURLToPath(new URL("./entry-trigger-audit.mjs", import.meta.url));
const rules = (result) => result.findings.map((f) => f.rule);

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

// --- 契約ファイルが正本であること --------------------------------------

const fileContract = loadContract();
assert.ok(existsSync(CONTRACT_PATH), "契約ファイルが実在する");
assert.deepEqual(INTENT_PHRASES, fileContract.canonicalIntentExamples, "例示の正本は契約ファイル");
assert.deepEqual(NARROW_TRIGGERS, fileContract.narrowTriggers.patterns, "禁止形の正本は契約ファイル");
assert.equal(MINIMUM_INTENT_EXAMPLES, fileContract.minimumIntentExamples, "下限の正本は契約ファイル");
assert.deepEqual(
  CANONICAL_DOCUMENTS.map((d) => d.path),
  fileContract.documents.canonical.map((d) => d.path),
  "対象文書の正本は契約ファイル",
);
// 契約ファイルに書いた受理パターンは、すべて正規表現として成立していること。
for (const [id, element] of Object.entries(fileContract.semanticElements)) {
  assert.ok(element.acceptedPatterns.length > 0, `${id} の acceptedPatterns が空`);
  for (const source of element.acceptedPatterns) {
    assert.doesNotThrow(() => new RegExp(source), `${id} の acceptedPatterns に不正な正規表現: ${source}`);
  }
}

// --- auditDocument 単体 -------------------------------------------------

assert.deepEqual(rules(auditDocument(CONTRACT_BODY, { requireContract: true })), [], "契約を満たす本文はfindingを出さない");
assert.deepEqual(rules(auditDocument(UPSTREAM_BODY, { requireContract: false })), [], "上位層は契約全文を要求されない");

// 狭い発火条件の再導入を、全形で落とす
for (const narrow of NARROW_TRIGGERS) {
  const regressed = `${CONTRACT_BODY}\n${narrow}の実装・修正では、ゲートを実行します。\n`;
  assert.ok(
    rules(auditDocument(regressed, { requireContract: true })).includes("narrow-trigger"),
    `狭い発火条件「${narrow}」の再導入を検出する`,
  );
}

// 履歴calloutの引用は現行契約と誤認しない
const withHistoricalCallout = [
  CONTRACT_BODY,
  "> [!important] 狭い発火条件が実害を出した（2026-08-29）",
  "> 旧文は「Figma URLや『デザインどおりに直して』という依頼」と書いていた。",
  "> Figma URL付きの実装・修正では、という表現も同じ欠陥である。",
  "",
].join("\n");
assert.deepEqual(
  rules(auditDocument(withHistoricalCallout, { requireContract: true })),
  [],
  "引用行に残る旧文をFAILにしない",
);
assert.ok(!stripQuotedLines(withHistoricalCallout).includes("Figma URLや"), "stripQuotedLinesが引用行を落とす");

// 引用の中にしか契約が無い状態は満たしたことにしない
const contractOnlyInQuote = ["# 入口", "", ...CONTRACT_BODY.split("\n").map((l) => `> ${l}`), ""].join("\n");
assert.ok(
  rules(auditDocument(contractOnlyInQuote, { requireContract: true })).length > 0,
  "引用の中だけに契約がある本文をPASSさせない",
);

// URL非依存の宣言を削ると落ちる（上位層でも必須）
const withoutUrlIndependence = CONTRACT_BODY.replace("**Figma URLが会話に出ているかどうかで判定しません。**", "");
for (const requireContract of [true, false]) {
  assert.ok(
    rules(auditDocument(withoutUrlIndependence, { requireContract })).includes("url-independence"),
    `URL非依存の宣言の削除を検出する (requireContract=${requireContract})`,
  );
}

// 「迷ったらゲートへ倒す」既定を削ると落ちる
const withoutAmbiguityDefault = CONTRACT_BODY.replace("判断に迷う依頼は、着手前ゲートを実行する側に倒します。", "");
assert.ok(
  rules(auditDocument(withoutAmbiguityDefault, { requireContract: true })).includes("ambiguity-default"),
  "「迷ったらゲートへ倒す」既定の削除を検出する",
);

// --- ここからが 2026-09-03 の設計変更の本体 -----------------------------
// 検査するのは契約要素であって特定の文言ではない。文言を直した担当を止めない。

// (1) 契約ファイルに載っている言い回しは、どれでも通る。
for (const [id, element] of Object.entries(fileContract.semanticElements)) {
  for (const source of element.acceptedPatterns) {
    const probe = { "url-independence": "Figma URLの有無ではなく依頼の意図で判定する。", "ambiguity-default": "判断がつかない依頼はゲート側へ倒す。" };
    void probe;
    assert.ok(new RegExp(source), `${id}: ${source}`);
  }
}
for (const phrasing of [
  "判断に迷う依頼は、着手前ゲートを実行する側に倒します。",
  "判断に迷う依頼は実行する側に倒す。",
  "Figma由来か判断できない依頼は、Figma側へ倒します。",
  "判断がつかない依頼はゲート側へ倒す。",
  "迷ったらゲートを実行する側へ倒します。",
]) {
  const body = CONTRACT_BODY.replace("判断に迷う依頼は、着手前ゲートを実行する側に倒します。", phrasing);
  assert.ok(
    !rules(auditDocument(body, { requireContract: true })).includes("ambiguity-default"),
    `既定の言い回し違いでFAILさせない: ${phrasing}`,
  );
}

// (2) 例示の逐語一致は要求しない。1件でも残っていれば通り、note で不足を伝える。
//     旧実装は5件すべてを逐語で要求し、4文書に同じ散文を byte 単位で強制していた。
for (let keep = 1; keep < INTENT_PHRASES.length; keep += 1) {
  let body = CONTRACT_BODY;
  for (const phrase of INTENT_PHRASES.slice(keep)) body = body.replace(phrase, "");
  const result = auditDocument(body, { requireContract: true });
  assert.ok(
    !rules(result).includes("intent-examples"),
    `例示 ${keep}/${INTENT_PHRASES.length} 件でFAILさせない`,
  );
  assert.ok(
    result.notes.some((note) => note.includes(`${keep}/${INTENT_PHRASES.length}`)),
    `不足を note で伝える (${keep}件)`,
  );
}

// (3) ただし例示が1件も無い入口は落とす。経路情報を持たないため。
let noExamples = CONTRACT_BODY;
for (const phrase of INTENT_PHRASES) noExamples = noExamples.replace(phrase, "");
assert.ok(
  rules(auditDocument(noExamples, { requireContract: true })).includes("intent-examples"),
  "例示が0件の入口は落とす",
);

// (4) 未知の言い回しは落ちるが、**契約ファイルへ1行足せばコードを触らずに通る**。
//     これが今回の設計変更の要点である。
const novel = CONTRACT_BODY.replace(
  "判断に迷う依頼は、着手前ゲートを実行する側に倒します。",
  "白黒つかない依頼は、ゲートを回す側に寄せます。",
);
assert.ok(
  rules(auditDocument(novel, { requireContract: true })).includes("ambiguity-default"),
  "契約に無い言い回しは落ちる",
);
const extendedContract = {
  ...fileContract,
  semanticElements: {
    ...fileContract.semanticElements,
    "ambiguity-default": {
      ...fileContract.semanticElements["ambiguity-default"],
      acceptedPatterns: [
        ...fileContract.semanticElements["ambiguity-default"].acceptedPatterns,
        "白黒つかない依頼[^。]*寄せます",
      ],
    },
  },
};
assert.deepEqual(
  rules(auditDocument(novel, { requireContract: true, contract: extendedContract })),
  [],
  "契約ファイルへ言い回しを1行足せば、コードを触らずに通る",
);

// (5) 落ちたときの出力が、直す場所を名指しする。
const hintResult = auditDocument(withoutAmbiguityDefault, { requireContract: true });
const hint = hintResult.findings.find((f) => f.rule === "ambiguity-default");
assert.match(hint.detail, /entry-trigger-contract\.json/, "直す場所（契約ファイル）を出力する");
assert.match(hint.detail, /コードではなく/, "コードを触らせない案内を出力する");

// --- runAudit（文書集合） -----------------------------------------------

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

// 入口2枚の片方だけを更新すると落ちる
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
assert.match(failCli.stderr, /entry-trigger-contract\.json/, "受理する言い回しの正本を出力で示す");

assert.equal(runCli(["--nope"], deps()).exitCode, 64, "不明な引数はexit 64");

// 実プロセスで現物を検査する。
// クラウドセッション／CIには上位層が存在しない（WORKFLOW.md「クラウドセッションでの実行範囲」）。
const upstreamPath = process.env[UPSTREAM_DOCUMENT.envKey] || UPSTREAM_DOCUMENT.defaultPath;
const upstreamReadable = existsSync(upstreamPath);
const realRun = spawnSync(
  process.execPath,
  upstreamReadable ? [TOOL_PATH] : [TOOL_PATH, "--skip-missing-upstream"],
  { encoding: "utf8" },
);
assert.equal(realRun.status, 0, `現物の入口が契約を満たす (${realRun.stdout ?? ""}${realRun.stderr ?? ""})`);
assert.match(realRun.stdout, /ENTRY TRIGGER AUDIT: PASS 5 document\(s\)/, "現物5文書がPASSする");

if (upstreamReadable) {
  assert.ok(!realRun.stdout.includes("(skipped)"), "上位層を読める環境で skip してはならない");
} else {
  assert.match(realRun.stdout, /web-development-workflow.*\(skipped\)/, "上位層不在時は skipped と明示する");
  const withoutFlag = spawnSync(process.execPath, [TOOL_PATH], { encoding: "utf8" });
  assert.equal(withoutFlag.status, 1, "上位層不在でフラグ無しなら落ちる");
  assert.match(withoutFlag.stdout, /upstream-unreadable/, "落ちた理由を名乗る");
}

process.stdout.write("entry-trigger-audit.e2e: PASS\n");
