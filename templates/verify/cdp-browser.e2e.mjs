#!/usr/bin/env node
// cdp-browser.e2e.mjs — 待機上限に達したときの出力が「次の一手」になっていることを固定する。
//
// 2026-09-01: 待機上限に達した実装役が、上書き手段が存在するのに気づかず
// 「検証を省略するpushはできない」とだけ報告して停止した。上書き手段は README に
// しか書かれておらず、失敗の瞬間には見えなかった。ブラウザを起動せずに検査できる
// 範囲（メッセージ内容と再試行の判定）だけをここで固定する。

import { navigationTimeoutHint } from "./cdp-browser.mjs";

const failures = [];

function check(label, condition, detail) {
  if (condition) return;
  failures.push(`${label}: ${detail}`);
}

const hint = navigationTimeoutHint(60000);

check("上書き用の環境変数名", hint.includes("FIGMA_VERIFY_NAV_TIMEOUT_MS"), `環境変数名が無い: ${hint}`);
check("現在値の明示", hint.includes("現在値: 60000ms"), `現在値が無い: ${hint}`);
check("既定値の明示", hint.includes("既定 60000ms"), `既定値が無い: ${hint}`);
check("合否が変わらないことの明示", hint.includes("合否基準は変わりません"), `合否への影響を書いていない: ${hint}`);
check("省略不要の明示", hint.includes("検証を省略する必要はありません"), `省略が唯一の道でないことを書いていない: ${hint}`);
check("実行例", hint.includes("FIGMA_VERIFY_NAV_TIMEOUT_MS=180000"), `そのまま使える例が無い: ${hint}`);

// 上書き値を渡しても、現在値としてその値が出ること。既定値を焼き込んでいないことの確認。
const overriddenHint = navigationTimeoutHint(180000);
check("上書き時の現在値", overriddenHint.includes("現在値: 180000ms"), `上書き値を反映していない: ${overriddenHint}`);

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log(`PASS: cdp-browser e2e (${7} case(s))`);
