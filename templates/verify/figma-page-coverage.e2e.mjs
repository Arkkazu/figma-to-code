// figma-page-coverage.mjs の機械検査に対する負のE2E。
//
// 対象は2つ。
//   1. assertFrozenMetadataConsistency … 凍結Figma metadataとcoverageの整合5件
//   2. canonicalCoverageDigest         … 承認を「分類内容」に紐づけるdigest
//
// どちらも「入れた」だけでは意味がなく、壊したときに落ちることを確かめないと
// 次の改修で黙って無効化される。実データに依存すると案件でしか回せないため、
// fixture はこのファイル内で組み立てて一時ディレクトリへ書き出す。
//
// 実行: node figma-page-coverage.e2e.mjs

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assertFrozenMetadataConsistency, canonicalCoverageDigest } from "./figma-page-coverage.mjs";

let passCount = 0;
let failCount = 0;

function report(ok, label, detail) {
  if (ok) {
    passCount += 1;
    console.log(`PASS  ${label}`);
  } else {
    failCount += 1;
    console.log(`FAIL  ${label}`);
    if (detail) console.log(`        ${detail}`);
  }
}

// --- fixture -------------------------------------------------------------
// PC: root 1:0
//       1:1 sectionA
//       1:2 sectionB
//         1:21 measureB1
//         1:22 measureB2
//       1:3 hiddenChild (hidden="true")
// SP: root 2:0
//       2:1 sectionA
//       2:2 sectionB
//         2:21 measureB1
const pcRaw = [
  '<frame id="1:0" name="root_pc" x="0" y="0" width="1440" height="2000">',
  '  <frame id="1:1" name="sectionA" x="0" y="0" width="1440" height="200" />',
  '  <frame id="1:2" name="sectionB" x="0" y="200" width="1440" height="600">',
  '    <frame id="1:21" name="measureB1" x="0" y="0" width="800" height="100" />',
  '    <rounded-rectangle id="1:22" name="measureB2" x="0" y="120" width="800" height="100" />',
  '  </frame>',
  '  <instance id="1:3" name="hiddenChild" x="0" y="900" width="1440" height="80" hidden="true" />',
  '</frame>',
].join("\n");

const spRaw = [
  '<frame id="2:0" name="root_sp" x="0" y="0" width="375" height="1200">',
  '  <frame id="2:1" name="sectionA" x="0" y="0" width="375" height="150" />',
  '  <frame id="2:2" name="sectionB" x="0" y="150" width="375" height="400">',
  '    <frame id="2:21" name="measureB1" x="0" y="0" width="335" height="80" />',
  '  </frame>',
  '</frame>',
].join("\n");

function baseCoverage() {
  return {
    version: 1,
    scopeId: "fixture-scope",
    pages: {
      pc: { url: "http://fixture.test/", nodeId: "1:0", metadataPath: "pc-metadata.json", metadataSha256: "unused" },
      sp: { url: "http://fixture.test/", nodeId: "2:0", metadataPath: "sp-metadata.json", metadataSha256: "unused" },
    },
    inventory: {
      source: "fixture",
      sections: [
        { sectionId: "sectionA", figmaNodeIds: { pc: "1:1", sp: "2:1" } },
        { sectionId: "sectionB", figmaNodeIds: { pc: "1:2", sp: "2:2" } },
      ],
    },
    plannedScopes: [{ scopeId: "follow-up", title: "後続", status: "planned" }],
    sections: [
      {
        sectionId: "sectionA",
        role: "deferred",
        componentIds: [],
        figmaNodeIds: { pc: "1:1", sp: "2:1" },
        reason: "fixtureでは対象外にする節",
        followUpScope: "follow-up",
      },
      {
        sectionId: "sectionB",
        role: "target",
        componentIds: ["componentB"],
        figmaNodeIds: { pc: "1:2", sp: "2:2" },
        measurementFigmaNodeIds: { pc: ["1:21", "1:22"], sp: ["2:21"] },
      },
    ],
  };
}

const workDirectory = mkdtempSync(join(tmpdir(), "figma-page-coverage-e2e-"));
writeFileSync(join(workDirectory, "pc-metadata.json"), JSON.stringify({ raw: pcRaw }), "utf8");
writeFileSync(join(workDirectory, "sp-metadata.json"), JSON.stringify({ raw: spRaw }), "utf8");
const coveragePath = join(workDirectory, "coverage.json");

function runConsistency(label, mutate, expectFail) {
  const coverage = baseCoverage();
  mutate(coverage);
  const sectionById = new Map(coverage.sections.map((section) => [section.sectionId, section]));
  let message = null;
  try {
    assertFrozenMetadataConsistency(coverage, coveragePath, sectionById, workDirectory);
  } catch (error) {
    message = error.message;
  }
  const threw = message !== null;
  report(threw === expectFail, label, threw ? message.split("\n").find((line) => line.trim().startsWith("- "))?.trim() : "落ちなかった");
}

function runDigest(label, mutate, expectChange) {
  const base = canonicalCoverageDigest(baseCoverage());
  const coverage = baseCoverage();
  mutate(coverage);
  const changed = canonicalCoverageDigest(coverage) !== base;
  report(changed === expectChange, label, `期待=${expectChange ? "変化" : "不変"} / 実際=${changed ? "変化" : "不変"}`);
}

try {
  console.log("=== 凍結metadata整合検査 ===");
  runConsistency("無改変では落ちない", () => {}, false);
  runConsistency("(1) 実在しないノードIDを section に入れる", (c) => {
    c.sections[1].figmaNodeIds.pc = "9:99";
    c.inventory.sections[1].figmaNodeIds.pc = "9:99";
  }, true);
  runConsistency("(2) measurement が自sectionの子孫でない", (c) => {
    c.sections[1].measurementFigmaNodeIds.pc = ["1:1"];
  }, true);
  runConsistency("(3) 同じ測定ノードを複数sectionが宣言（二重計上）", (c) => {
    c.sections[0].measurementFigmaNodeIds = { pc: ["1:21"], sp: [] };
    // sectionA を sectionB の親にして包含検査を通し、二重計上だけを起こす
    c.sections[0].figmaNodeIds.pc = "1:0";
    c.inventory.sections[0].figmaNodeIds.pc = "1:0";
  }, true);
  runConsistency("(4) hidden継承のノードを section に入れる", (c) => {
    c.sections[0].figmaNodeIds.pc = "1:3";
    c.inventory.sections[0].figmaNodeIds.pc = "1:3";
  }, true);
  runConsistency("(5) page root 直下の可視ノードが inventory で被覆されない", (c) => {
    c.sections = c.sections.filter((section) => section.sectionId !== "sectionA");
    c.inventory.sections = c.inventory.sections.filter((section) => section.sectionId !== "sectionA");
  }, true);
  runConsistency("hidden の root 直下ノードは被覆不要", (c) => {
    // 1:3 は hidden。どのsectionも担当していないが落ちてはいけない（baseline と同じ状態）
    c.inventory.source = "hidden child は対象外";
  }, false);

  console.log("\n=== digest（承認を分類内容に紐づける） ===");
  runDigest("coverageExpansion の追加は分類変更ではない", (c) => {
    c.coverageExpansion = { supersededApprovalDigest: "x".repeat(64), ownerInstruction: "テスト用の指示。20文字以上あります。", addedSectionIds: [] };
  }, false);
  runDigest("deferred の reason 変更は判定対象の変更", (c) => { c.sections[0].reason = "書き直した理由"; }, true);
  runDigest("inventory.source の変更は判定対象の変更", (c) => { c.inventory.source = "書き直し"; }, true);
  runDigest("viewportPairingNote の追加は判定対象の変更", (c) => { c.sections[1].viewportPairingNote = "注記"; }, true);
  runDigest("plannedScopes.title の変更は分類変更ではない", (c) => { c.plannedScopes[0].title = "別タイトル"; }, false);

  runDigest("キー順を変えても digest は不変", (c) => {
    const s = c.sections[1];
    const reordered = {};
    for (const key of Object.keys(s).reverse()) reordered[key] = s[key];
    c.sections[1] = reordered;
  }, false);

  runDigest("role の変更は分類変更", (c) => { c.sections[0].role = "target"; }, true);
  runDigest("componentIds の追加は分類変更", (c) => { c.sections[1].componentIds.push("extra"); }, true);
  runDigest("figmaNodeIds の差し替えは分類変更", (c) => { c.sections[1].figmaNodeIds.pc = "1:1"; }, true);
  runDigest("measurementFigmaNodeIds の追加は分類変更", (c) => { c.sections[1].measurementFigmaNodeIds.pc.push("1:22"); }, true);
  runDigest("followUpScope の変更は分類変更", (c) => { c.sections[0].followUpScope = "other"; }, true);
  runDigest("inventory の並び替えは分類変更", (c) => { c.inventory.sections.reverse(); }, true);
  runDigest("plannedScopes.status の変更は分類変更", (c) => { c.plannedScopes[0].status = "done"; }, true);
  runDigest("pages.pc.nodeId の変更は分類変更", (c) => { c.pages.pc.nodeId = "9:9"; }, true);
  runDigest("pages の metadataSha256 変更は分類変更", (c) => { c.pages.sp.metadataSha256 = "other"; }, true);
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}

console.log(`\nfigma-page-coverage.e2e: ${failCount === 0 ? "PASS" : "FAIL"} (${passCount} passed / ${failCount} failed)`);
if (failCount > 0) process.exitCode = 1;
