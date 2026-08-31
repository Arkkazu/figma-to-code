# mistakes-archive.md — 退避済み

> 上限を超えた分を日付の新しい順にここへ移す。**削除ではなく退避**で、本文は当時のまま保存する。
> セッション開始時の必読対象ではない。必要なときだけ `grep -n "<対象>"` で引く。

---

<!-- ここから下に退避していく。最新を上に。 -->

## 2026-07-05（2026-06-25の再発）
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- やらかし：OPENトップ独自実装で、bannerセクションの背景色を縮小全体スクショの印象から #000 と推測して実装した。実際はFigmaノード個別スクショのピクセル実測で #EDEDEC（n150_bg）だった。
- 原因：bannerノード自体に塗りが無く design_context に背景が出てこなかったとき、「未取得」として止まらず、周辺（FVの黒）から推測で補完した。2026-06-25に記録済みの「背景色は縮小全体スクショで判断しない」ルールを読んでいたのに、確定手順（get_variable_defs / 個別スクショ）を踏まなかった。
- 再発防止：design_context に背景指定（bg-*）が出てこないノードは「背景未取得」として扱い、実装前に必ず①親フレームの get_variable_defs ②対象ノードの get_screenshot（個別）＋ピクセル実測 のどちらかで確定させる。背景が透明・親依存のノードは特に「塗りが無い＝白/黒」と決めつけない。セクション一覧を作る際は「各セクションの背景色の根拠（node/実測値）」を1列設けて、根拠なしの背景色を機械的に検出する。

## 2026-07-01
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- やらかし：SPのFV実績サマリーで「少しズレている」と指摘された際、ズレ方向を確認せず、最初は先頭項目のfont-size、次に各itemのwidth固定を推測で変更した。実際の正解は `padding-top: 4rem` で、縦方向の内部位置ズレだった。
- 原因：Figma数値とCSS差分を見て、実表示で「縦ズレか横ズレか」「親配置か子余白か」を切り分ける前に原因プロパティを決めつけた。
- 再発防止：レイアウトの「ズレ」修正では、コード変更前に必ずズレ方向（縦/横）、対象（親/子/疑似要素/テキスト）、差分量、触る1プロパティを明文化する（診断表は `corrections.md` 2026-07-01）。これらを確認できない場合は、Figma値が取れていてもコードを変更せず、未確認として止める。

## 2026-07-01
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- やらかし：SPトップチェックで、セクションの開始位置・高さがFigmaに近いことを確認しただけで、FVリード文の改行がFigmaの指定と違うことを見落とした。
- 原因：外枠レイアウトの数値照合を「デザインどおり」の判定にしてしまい、主要パーツ単位の文言・改行・行数チェックを省略した。
- 再発防止：Figmaレイアウトチェック時は、セクション外枠の後に主要パーツ表を作り、各パーツの文言・改行・行数・サイズ・位置を照合する。特にFV、section heading、lead、CTA、カード本文はget_design_contextのテキスト実値を必ず読む。

## 2026-06-30
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- やらかし：FVイラストPCの解像度不足を直す際、Figmaノードを2倍書き出しした画像を採用し、透過がデザイン仕様であることをα値で確認しなかった。結果として画像の背景が白くなった。
- 原因：寸法不足の解消だけを優先し、PNGのアルファチャンネルが実際に透明ピクセルを保持しているか検査しなかった。Figmaのnode exportとraw assetで透過保持状態が異なる可能性を見落とした。
- 再発防止：透過PNGをFigmaから差し替えるときは、寸法・MIMEだけでなくα値の透明/半透明ピクセル数を確認する。node exportで白背景が混入する場合はraw assetを優先し、解像度不足は「Figma側で高解像度透過元が必要」として報告する。

## 2026-06-30
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- やらかし：カード画像の `alt` だけを直し、Figma画像出力ルールのPC用ラスター画像1.5倍基準に対する実寸確認を漏らした。
- 原因：W3C/alt観点だけで修正完了と判断し、画像ルールの解像度・書き出し倍率まで同時に照合しなかった。
- 再発防止：Figma由来画像を修正するときは、`alt`、実フォーマット/拡張子、表示CSSサイズ、PC/SP別の標準書き出し倍率、ファイルサイズをセットで確認してから完了報告する。

## 2026-06-25（3）CodexでFigma MCP確認を早々に諦めた
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- やらかし：Codexのツール一覧にFigma MCPが出ないだけで「Figmaを直接確認できない」と判断し、`.claude/settings.json` に残っていたClaude Figma MCPのasset URLを確認しないまま推測で修正した。結果としてFigmaスクショと逆の変更を入れた。
- 原因：Codexで利用可能なMCPツールと、過去にClaude MCPが取得したFigma asset URLを切り分けなかった。ローカル設定ファイルの確認が不足した。
- 再発防止：Figma照合を求められたら、まずMCPツール可否を確認し、無い場合も `.claude/settings.json` / 案件側 `MyBrain/reports` / ローカルFigma画像 / `https://www.figma.com/api/mcp/asset/...` の取得可否を確認してから実装する。Figma実物または取得済みスクショを見ずにレイアウト順・背景色を変更しない。

## 2026-06-25
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
<!-- loop-log: {"id":"mistake-provenance-spec-20260625","kind":"mistake","failureClass":"unverified-figma-value","recurrenceKey":"unverified-figma-value","action":"strengthen","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.mjs","templates/verify/figma-gate.e2e.mjs"]} -->
- やらかし：Figmaを基にコーディングした際、font-size・letter-spacing・line-height・余白を実値で確認せず目分量で実装した。さらに「全体スクショが暗い」だけで全セクションをダークテーマ化したが、実際は暗いのは一部セクションのみだった。オーナーに「フォントサイズも違うし全然figma通りでない」と強く叱責された。
- 原因：design_context で各要素の実値（font-size/tracking/line-height/color）が取れるのに使わず推測した。背景は縮小スクショの印象だけで判断し、反証を見落とした。
- 再発防止：Figma→実装では「目分量禁止」。①各要素の font-size / letter-spacing / line-height / color / padding / gap は必ず design_context の実値を転記する（letter-spacing は px→em換算）。②背景色は縮小全体スクショで判断せず、get_variable_defs か個別スクショで確定する。③1セクション実装ごとに該当ノードの design_context を開いて値を突き合わせる。推測値を1つでも入れない。

## 2026-06-24
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- やらかし：Figmaレビューでカードの本文を「3枚とも同一ダミー」と判定したが、実際は3枚それぞれ別の確定文面だった（オーナー指摘「本文はそれぞれ違うぞ」）。
- 原因：3枚分のテキストを design_context で全部読まず、見出しだけ／一部だけ見て「同一ダミー」と推測で断定した。
- 再発防止：レビューで「全部同じ」「ダミー」等と断定する前に、必ず対象インスタンス全件を design_context で取得し、各テキストの実値を並べて比較してから判定する。1件でも未取得なら「未確認」と書く。
