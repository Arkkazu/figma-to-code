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
//
// ---- 検査するのは契約要素であって、特定の文言ではない（2026-09-03 設計変更）----
//
// 旧実装は5つの例示を**逐語で**要求し、受理する言い回しを検査器のコードへ埋め込んでいた。
// 実測: 4文書が同じ散文を byte 単位で持つことを強制され、
// 2026-09-02 に別担当が入口を「Figma専用」から「全Web編集の開始ゲート」へ広げる
// 正当な改善を入れたところ、契約要素は別の言い回しで残っていたのに FAIL になった。
// **検査器が他担当の改善を、言い回し違いだけで止めた。**
// 排他所有台帳が「担当を名前で固定して止めた」のと同じ型の誤りである。
//
// 対策は2つ。
//  (1) 受理する言い回しを verify-config/entry-trigger-contract.json へ出す。
//      文言を直した担当は、コードではなくデータへ1行足せば済む。落ちたときの出力でそう案内する。
//  (2) 例示の逐語一致を必須にしない。「迷ったらゲート側へ倒す」既定があるため
//      列挙は網羅でなくてよく、逐語要求は誤検出しか生まない。0件の文書だけを落とす。
//
// 落とすのは、実害が記録されている次の3つに絞る。
//  - 狭窄（URLがあるときだけ、という書き方）
//  - URL非依存の宣言が無い
//  - 「迷ったらゲートへ倒す」既定が無い

import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const CONTRACT_PATH = resolve(REPO_ROOT, "verify-config/entry-trigger-contract.json");

export function loadContract(path = CONTRACT_PATH, read = (p) => readFileSync(p, "utf8")) {
  const raw = JSON.parse(read(path));
  if (raw.version !== 1) throw new Error(`entry trigger contract version must be 1; got ${raw.version}`);
  return raw;
}

const contract = loadContract();

// 既存の呼び出し元と負のE2Eのために名前は保つが、値の正本は契約ファイルにある。
export const INTENT_PHRASES = Object.freeze([...contract.canonicalIntentExamples]);
export const MINIMUM_INTENT_EXAMPLES = contract.minimumIntentExamples;
export const NARROW_TRIGGERS = Object.freeze([...contract.narrowTriggers.patterns]);
export const CANONICAL_DOCUMENTS = Object.freeze(contract.documents.canonical.map((d) => Object.freeze({ ...d })));
export const UPSTREAM_DOCUMENT = Object.freeze({ ...contract.documents.upstream });
export const IDENTICAL_PAIRS = Object.freeze(contract.documents.identicalPairs.map((p) => Object.freeze([...p])));

function elementMatchers(id) {
  return contract.semanticElements[id].acceptedPatterns.map((source) => new RegExp(source));
}
export const URL_INDEPENDENCE_PATTERNS = Object.freeze(elementMatchers("url-independence"));
export const AMBIGUITY_DEFAULT_PATTERNS = Object.freeze(elementMatchers("ambiguity-default"));

// 文言を直した担当が「どこを直せば通るか」を、出力だけで分かるようにする。
function rephrasingHint(elementId) {
  return (
    `\n      同じことを別の言い回しで書いているなら、コードではなく` +
    ` verify-config/entry-trigger-contract.json の semanticElements.${elementId}.acceptedPatterns へ` +
    `その言い回しを1行足す。要素そのものを消した場合は、足さずに書き戻す。`
  );
}

// 履歴calloutは「旧文はこう書いていた」を引用するため、そのまま禁止語検査に掛けると
// 必ず落ちる。引用行を外してから禁止語を見る。要求語の検査も同じ本文で行う
// （引用の中にしか契約が無い、という状態を満たしたことにしないため）。
export function stripQuotedLines(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line))
    .join("\n");
}

// contract を差し替え可能にしてある。「言い回しを足せばコードを触らずに通る」ことを
// 負のE2Eで実証するために必要で、実行時は既定の契約ファイルがそのまま使われる。
export function auditDocument(text, { requireContract, contract: override } = {}) {
  const active = override ?? contract;
  const INTENT = active.canonicalIntentExamples;
  const MIN = active.minimumIntentExamples;
  const NARROW = active.narrowTriggers.patterns;
  const urlPatterns = active.semanticElements["url-independence"].acceptedPatterns.map((s) => new RegExp(s));
  const ambiguityPatterns = active.semanticElements["ambiguity-default"].acceptedPatterns.map((s) => new RegExp(s));

  const body = stripQuotedLines(text);
  const findings = [];
  const notes = [];
  const add = (rule, detail) => findings.push({ rule, detail });

  for (const phrase of NARROW) {
    if (body.includes(phrase)) {
      add(
        "narrow-trigger",
        `狭い発火条件が本文に残っている: ${phrase}` +
          "\n      発火条件をURLの有無へ狭めない。2026-08-29 にこの形で実害が出ている。",
      );
    }
  }

  if (!urlPatterns.some((pattern) => pattern.test(body))) {
    add(
      "url-independence",
      "「Figma URLの有無で判定しない」という宣言が本文に無い。" + rephrasingHint("url-independence"),
    );
  }

  if (requireContract) {
    if (!ambiguityPatterns.some((pattern) => pattern.test(body))) {
      add(
        "ambiguity-default",
        "「不確かなときはゲートを実行する側へ倒す」既定が本文に無い。" +
          "\n      この既定があるから例示は網羅でなくてよい。無いと、広い列挙も「該当しないと判断した」で抜けられる。" +
          rephrasingHint("ambiguity-default"),
      );
    }

    // 例示は網羅を要求しない。0件だけを落とす。
    const present = INTENT.filter((phrase) => body.includes(phrase));
    if (present.length < MIN) {
      add(
        "intent-examples",
        `依頼の意図の例示が ${present.length} 件しかない（最低 ${MIN} 件）。` +
          "\n      例示が1件も無い入口は、どの依頼がこの規則に当たるかの手がかりを持たない。" +
          `\n      正本の例示: ${INTENT.join(" ")}`,
      );
    } else if (present.length < INTENT.length) {
      notes.push(
        `例示は ${present.length}/${INTENT.length} 件。` +
          "「迷ったらゲートへ倒す」既定があるため不足は違反にしない（逐語一致を要求すると、" +
          "文言を直した担当を止めるだけになる）。",
      );
    }
  }

  return { findings, notes };
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
  const record = (id, path, status, result) =>
    documents.push({ id, path, status, findings: result?.findings ?? [], notes: result?.notes ?? [] });

  for (const doc of CANONICAL_DOCUMENTS) {
    const absolute = resolve(root, doc.path);
    const text = readOrNull(absolute, readPath);
    if (text === null) {
      record(doc.id, absolute, "missing", {
        findings: [{ rule: "document-unreadable", detail: "入口文書を読めない。" }],
      });
      continue;
    }
    record(doc.id, absolute, "read", auditDocument(text, { requireContract: true }));
  }

  const upstreamPath = env[UPSTREAM_DOCUMENT.envKey] || UPSTREAM_DOCUMENT.defaultPath;
  const upstreamText = exists(upstreamPath) ? readOrNull(upstreamPath, readPath) : null;
  if (upstreamText === null) {
    record(UPSTREAM_DOCUMENT.id, upstreamPath, skipMissingUpstream ? "skipped" : "missing", {
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
    // 上位層は契約の全文を持たない（Figma正本を指す1行）。狭窄の禁止とURL非依存だけを課す。
    record(UPSTREAM_DOCUMENT.id, upstreamPath, "read", auditDocument(upstreamText, { requireContract: false }));
  }

  const pairs = [];
  for (const [left, right] of IDENTICAL_PAIRS) {
    const a = readOrNull(resolve(root, left), readPath);
    const b = readOrNull(resolve(root, right), readPath);
    const identical = a !== null && b !== null && a === b;
    pairs.push({ left, right, identical });
    if (!identical) {
      record("identical-pair", `${left} / ${right}`, "read", {
        findings: [
          {
            rule: "entry-pair-drift",
            detail:
              `${left} と ${right} の内容が一致しない。` +
              "\n      両者は同一内容で配られる。片方だけ更新しない。",
          },
        ],
      });
    }
  }

  const findingCount = documents.reduce((total, doc) => total + doc.findings.length, 0);
  return { ok: findingCount === 0, findingCount, documents, pairs, contractPath: CONTRACT_PATH };
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
    for (const note of doc.notes) lines.push(`       note: ${note}`);
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
      `受理する言い回しの正本は ${CONTRACT_PATH} にある。**文言を直したのが原因ならコードではなくこのファイルを直す。**\n` +
      "例示の逐語一致は要求していない（0件のときだけ落とす）。狭い条件へ戻す変更と、片方だけの更新は許さない。\n",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { exitCode, stdout, stderr } = runCli(process.argv.slice(2));
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  process.exit(exitCode);
}
