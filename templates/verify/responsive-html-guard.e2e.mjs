#!/usr/bin/env node
// responsive-html-guard の負のE2E。
//
// 固定するのは「例外が主張を裏取りされること」。
// 2026-09-03 まで、例外は sourceFile / baseClass / reason の3つを持ち、
// **reason はガード側で一度も読まれなかった**。非空文字列が1つあれば、その class の
// 単一DOM検査が恒久的に外れた。「文字列があるか」で判定して、実際の危険
// （その重複が本当に不可避か）を見ていない典型的な代理判定だった。

import assert from "node:assert/strict";
import { corroborateExceptions, duplicatedVariants } from "./responsive-html-guard.mjs";

const DUP = `
<div class="card-pc"><p>同じ本文がPCとSPに二重に置かれている</p></div>
<div class="card-sp"><p>同じ本文がPCとSPに二重に置かれている</p></div>
`;
const SINGLE = `
<div class="card"><p>同じ本文がPCとSPに二重に置かれている</p></div>
`;
const OTHER_DUP = `
<div class="hero-pc"><p>別のクラスで二重になっている本文である</p></div>
<div class="hero-sp"><p>別のクラスで二重になっている本文である</p></div>
`;

// --- duplicatedVariants（assert と裏取りが同じ判定を使うこと） -----------

const dup = duplicatedVariants(DUP, "page.php");
assert.equal(dup.length, 1, "重複を1件検出する");
assert.equal(dup[0].key, "page.php::card", "key は path::baseClass");
assert.deepEqual(duplicatedVariants(SINGLE, "page.php"), [], "単一DOMは重複としない");

// --- corroborateExceptions ----------------------------------------------

const exception = { sourceFile: "page.php", baseClass: "card", reason: "既存の本文PC/SP分岐であり、今回の変更対象外" };

// (1) このscopeより前から在った重複は、例外として通る。
//     実データ3件（page-service-brand.php::service-brand-overview__lead）がこの形。
{
  const { violations, notes } = corroborateExceptions([exception], () => DUP);
  assert.deepEqual(violations, [], "既存の重複は例外として通る");
  assert.deepEqual(notes, [], "裏を取れたので note は出ない");
}

// (2) **このscopeで新しく作った重複は、例外では通らない。**これが今回の要点。
//     旧実装は reason の文字列だけを見ていたので、この区別ができなかった。
{
  const { violations } = corroborateExceptions([exception], () => SINGLE);
  assert.equal(violations.length, 1, "新しく作った重複は通さない");
  assert.match(violations[0], /このscopeより前には存在しない/, "理由を名指しする");
  assert.match(violations[0], /単一DOM/, "直し方を出力する");
  assert.match(violations[0], /既存の本文PC\/SP分岐/, "宣言された理由も併記して判断材料にする");
}

// (3) 別のクラスが重複していても、宣言した class の裏取りにはならない。
//     「同じファイルに何か重複があればよい」にすると、例外がファイル単位の免罪符になる。
{
  const { violations } = corroborateExceptions([exception], () => OTHER_DUP);
  assert.equal(violations.length, 1, "別クラスの重複を裏取りに流用させない");
}

// (4) 変更前を取得できない場合（新規ファイル、履歴を読めない環境）は、
//     裏を取れていない事実を note に残して通す。黙って通さない。
{
  const { violations, notes } = corroborateExceptions([exception], () => null);
  assert.deepEqual(violations, [], "裏取り不能で作業自体を止めない");
  assert.equal(notes.length, 1, "裏を取れていない事実を残す");
  assert.match(notes[0], /裏を取れていない/, "裏取り不能と明示する");
  assert.match(notes[0], /page\.php::card/, "どの例外かを名指しする");
}

// (5) 例外が複数あるとき、通るものと通らないものを取り違えない。
{
  const good = { sourceFile: "a.php", baseClass: "card", reason: "既存分岐" };
  const bad = { sourceFile: "b.php", baseClass: "card", reason: "既存分岐" };
  const { violations } = corroborateExceptions([good, bad], (p) => (p === "a.php" ? DUP : SINGLE));
  assert.equal(violations.length, 1, "通らないものだけを挙げる");
  assert.match(violations[0], /b\.php::card/, "対象を取り違えない");
}

// (6) 例外が0件なら何も起きない。
{
  const { violations, notes } = corroborateExceptions([], () => null);
  assert.deepEqual(violations, [], "例外が無ければ違反も無い");
  assert.deepEqual(notes, [], "例外が無ければ note も無い");
}

process.stdout.write("responsive-html-guard.e2e: PASS\n");
