#!/usr/bin/env node
// 受領証の保持を「リース」として扱う共通判定。
//
// **保持は「取ったら効き続ける」ではなく、更新し続けている間だけ効く。**
//
// なぜそうしたか。保持者が生きているかを観測する手段が無いのに、生きている前提の排他を
// かけていた。セッションは黙って死に、contextは消え、別担当は abort せずに終わる。
// そのため 2026-08-21 から 2026-09-10 までに、同じ形の詰まりを7回直している
// （受領証1枠の奪い合い / waiting のまま2日放置 / 他scopeのdirtyで全scopeがclose不可 /
// close済みの所有が19ファイルをせき止め / 受領証を持たない予約が42パスを保持 / 滞留受領証）。
// 対処は毎回「止める条件をひとつ狭める」で、そのたびに新しい死に方が残った。
// 生存の推定を足し続けるのをやめ、更新が絶えたら自動的に失効する側へ既定を反転させた。
//
// 2026-08-26 の実測が、放置しておく費用の実例である。waiting のまま2日放置された所有が
// 共有インフラをせき止め、止められた側が迂回実装を書き、ゲートはそれを通した。
// 当時の記録は「ゲートが実装品質を下げた」と結んでいる。
//
// 失効しても保持者の作業は消えない。続けるなら受領証を更新（再preflight・checkpoint）すれば
// リースは延びる。取り除いたのは「放置したまま他人を止め続けられる」状態だけである。

// リース期限（日数）。旧名 GATE_STALE_PREFLIGHT_DAYS も読む（設定済みの環境を壊さない）。
export const GATE_LEASE_DAYS = Number.parseFloat(
  process.env.GATE_LEASE_DAYS ?? process.env.GATE_STALE_PREFLIGHT_DAYS ?? "7",
);

// 受領証が最後に動いた時刻。キーは gate ごとに違うため、既知の候補すべてから最新を採る。
// coding gate は startedAt、figma gate は preflightAt、checkpoint は passedAt を書く。
// renewedAt は gate が更新のたびに書く明示キーで、無い受領証も上の実測値で判定できる。
//
// 2026-09-10: startedAt だけを見ていたため、案件の figma 受領証18件すべてで判定が
// 素通りしていた。合成fixtureだけで検査し、実データへ当てていなかったのが原因である。
export function lastActivityAt(state) {
  const stamps = [];
  const push = (value) => {
    const time = Date.parse(value ?? "");
    if (Number.isFinite(time)) stamps.push(time);
  };
  push(state?.renewedAt);
  push(state?.startedAt);
  push(state?.preflightAt);
  push(state?.amendedAt);
  for (const bucket of [state?.checkpoints, state?.sections, state?.components]) {
    if (!bucket || typeof bucket !== "object") continue;
    for (const record of Object.values(bucket)) {
      if (!record || typeof record !== "object") continue;
      push(record.passedAt);
      push(record.renewedAt);
      push(record.closedAt);
      push(record.at);
    }
  }
  return stamps.length ? Math.max(...stamps) : null;
}

// リースが切れているなら経過日数を返す。時刻を1つも読めない受領証は判定しない（保持のまま）。
// 時刻が無いことを失効の根拠にすると、キー名を1つ知らないだけで他人の作業を奪える。
export function expiredLeaseDays(state, now = Date.now()) {
  const at = lastActivityAt(state);
  if (at === null) return null;
  const days = (now - at) / 86400000;
  return days > GATE_LEASE_DAYS ? days : null;
}
