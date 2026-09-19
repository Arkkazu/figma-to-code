#!/usr/bin/env node
// cdp-browser.e2e.mjs — 待機上限に達したときの出力が「次の一手」になっていることを固定する。
//
// 2026-09-01: 待機上限に達した実装役が、上書き手段が存在するのに気づかず
// 「検証を省略するpushはできない」とだけ報告して停止した。上書き手段は README に
// しか書かれておらず、失敗の瞬間には見えなかった。ブラウザを起動せずに検査できる
// 範囲（メッセージ内容と再試行の判定）だけをここで固定する。

import { navigationTimeoutHint, primeImagesForMeasurement } from "./cdp-browser.mjs";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

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

function fixture() {
  const image = { tagName: "IMG", src: "fixture.png", currentSrc: "fixture.png", loading: "lazy", removeAttribute() {} };
  const win = { scrollX: 3, scrollY: 11, scrollTo(p) { this.scrollX = p.left; this.scrollY = p.top; } };
  const ancestor = { scrollLeft: 7, scrollTop: 19, parentElement: null, scrollTo(p) { this.scrollLeft = p.left; this.scrollTop = p.top; } };
  const root = { scrollLeft: 13, scrollTop: 23, parentElement: ancestor, tagName: "DIV", querySelectorAll: () => [image], scrollTo: ancestor.scrollTo,
    scrollIntoView() { ancestor.scrollLeft = 210; ancestor.scrollTop = 310; win.scrollX = 110; win.scrollY = 410; this.scrollLeft = 90; } };
  return { image, win, ancestor, root, doc: { images: [image] } };
}
const restored = f => f.ancestor.scrollLeft === 7 && f.ancestor.scrollTop === 19 && f.root.scrollLeft === 13 && f.root.scrollTop === 23 && f.win.scrollX === 3 && f.win.scrollY === 11;
const normal = fixture();
primeImagesForMeasurement([normal.root], normal.doc, normal.win);
check("祖先・root・windowのスクロール復元", restored(normal), "readinessが配置を変えた");
check("画像の読込強制は維持", normal.image.loading === "eager" && normal.image.fetchPriority === "high", "lazy画像が残った");
const empty = fixture();
primeImagesForMeasurement([], empty.doc, empty.win);
check("rootなしの画像読込", empty.image.loading === "eager" && restored(empty), "rootなしの既存契約が壊れた");
const thrown = fixture();
thrown.root.querySelectorAll = () => { throw Error("fixture failure"); };
try { primeImagesForMeasurement([thrown.root], thrown.doc, thrown.win); } catch {}
check("読込例外時もスクロール復元", restored(thrown), "例外でスクロールが残った");
const weakened = primeImagesForMeasurement.toString()
  .replace('for (const [element, position] of scrollPositions) element.scrollTo({ ...position, behavior: "instant" });', '')
  .replace('win.scrollTo({ ...windowPosition, behavior: "instant" });', '');
const negative = fixture();
runInNewContext(`(${weakened})([f.root], f.doc, f.win)`, { f: negative });
check("復元除去を検出する負テスト", !restored(negative), "復元の欠落を検出できない");
const source = readFileSync(new URL("./cdp-browser.mjs", import.meta.url), "utf8");
check("実ナビゲーションから復元処理を呼ぶ", source.includes('${primeImagesForMeasurement.toString()})(roots, document, window)'), "helperが測定経路につながっていない");

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log(`PASS: cdp-browser e2e (${13} case(s))`);
