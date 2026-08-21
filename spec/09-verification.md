# 09. 実装とデザインの一致の自動検証

- 状態: 確定
- 目的: Figma実装の合否を、目視や推測ではなく、Figma取得値・spec・実ブラウザ実測・必要時の画像差分で判断する。

## 方針

実行上の正本は `C:\AI\figma-to-code\rules\figma-spec-pipeline.md` とする。スクリーンショットは補助証跡であり、レイアウト・文字・余白・状態の合否はspecに記録した数値とCDP実測で決める。スクリーンショット差分で見つけた問題は、可能な限りspecの数値要件へ戻して再検証する。

## 1. 検証の三層

| 層 | 対象 | 合格条件 |
| --- | --- | --- |
| 静的検証 | Sass build、単位lint、PHP lint、HTML変更時のW3C検証（基準は `C:\AI\web-development\rules\w3c-validation.md`） | 各正本の合格条件を満たす |
| 数値検証 | 位置、寸法、余白、カード内部の相対座標（offsetLeft / offsetTop）、文字、改行・行数、line-height、角丸、背景色・文字色・四辺の枠線色と枠線幅を含むcomputed style、状態、DOM属性（href / src） | PC/SPのspec全件PASS |
| 描画検証 | 画像、グラデーション、mask、blend、shadowなどのpainted要素 | Figma参照画像との差分がコンポーネント閾値内 |

## 2. 実測の前提

- FigmaのPC/SP node、親・兄弟・variant、可視・非表示レイヤーを取得する。
- Figma参照画像は対象要素の論理寸法へ正規化し、export URL・形式・SHA-256を記録する。
- 案件側 `MyBrain/verify/spec-*.json` に、対象viewport・selector・期待値・許容差を記録する。
- 案件側 `MyBrain/verify/` にFigmaノードとDOMの全件対応表を置く。親要素のwidth、height、x、y、padding、gap、overflowも対象に含める。同じ内容を機械可読な `nodemap-*.json` にも記述し、`scope.nodeMapPath` へ登録する（Markdownの対応表はハッシュ固定のみで内容を検査できないため）。
- **Figma上テキストのノードは文言を検証する。** node mapの `mapped` エントリに `figmaNodeType` を持たせ、`TEXT` を宣言した対応先は spec で `text` を検証することを必須にする。幾何値が全一致でも文言が違えば実装できていない（実測で、数値30行が全一致なのにラベルと注記が33箇所ずれたまま合格したscopeがあった）。
- **spec要素は必ず1つ以上の期待値を持つ。** `sel` と `note` だけの要素は比較対象がゼロなので、合格しても何も保証しない。証跡には要素数だけが残り検証したように見えるため、`preflight` が拒否する。書けないなら要素ごと消す。`viewports` / `elements` が空の spec も同様に通さない。
- **矩形に現れない性質もspecへ書く。** `text-align`、`font-weight`、装飾などは `getBoundingClientRect` に出ないため、期待値を書かない限り実測が全件PASSしても誤りが残る。同一要素でもPC/SPそれぞれの `get_design_context` を取り、指定の有無を比べる。
- **リンク先と画像の同一性はDOM属性で照合する。** `href` と `src` は矩形・computed style・pixel diffだけでは保証できない。Figmaが値を持つ場合はFigma取得元、Figmaに表現されないリンク先は記録済みのオーナー決定を `owner-decision` としてprovenanceへ明記し、レンダリング済みDOMの属性値と照合する。
- **line-heightはトークンの%をそのまま採らない。** Figmaのテキストエンジンは行送りを整数pxへ丸めて描画するため、16px/160%は25.6pxではなく26pxで描かれる。`Text nodeの高さ ÷ 行数` で検算し、provenanceは `metadata` にする。1行あたりの差は許容差に埋もれるので、同じトークンを使う要素のうち**最も行数の多いもの**で検算する。
- **測定幅の規約をspecに宣言する。** `viewportPolicy.scrollbars` は `hidden`（`--hide-scrollbars` でスクロールバーの無い理想幅）または `visible`（実ブラウザと同じスクロールバー幅を含む）のいずれか。未宣言はSPEC FAIL。中央寄せ要素のx座標はこの差でずれるため、CDP実測と撮影の両方で同じ値を使い、evidenceに残す。
- **`preflight` は編集前に通す。** 変更対象がgit上ですでにdirtyならSPEC FAILとする。ビルド生成物は `scope.generatedTargets` に宣言する。**dirtyの内容が合格済みclose-reportの `fileHashes` と一致する場合は、完了済みscopeの検証済み成果とみなして承認なしで通す。**未コミットのまま次のscopeへ進むのは通常運用であり、そのたびに承認の抜け穴を使わせるとゲートが形骸化するため。承認 `scope.preEditApproval` は、引き継ぎで説明できないdirtyにだけ使う。
- **page coverageは `inventory` と `sections` の2層で宣言する。** `inventory` はページroot配下の全セクションを `figmaNodeIds.pc` / `.sp` の対で固定する不変証跡、`sections` はそれを `target` / `context` / `deferred` に分類するscope単位の契約。`context` は共有ヘッダー・フッターのみ、`deferred` は着手しない宣言で `figmaNodeIds` の対・`reason`・`followUpScope` を必須とする。`preflight` は分類漏れと未登録の両方をFAILにする。対象外を検証器が読まないフィールドへ置くことは、カバレッジ要件を満たさない。

## 3. 実装中のゲート

`C:\AI\figma-to-code\templates\verify\figma-gate.mjs` を案件側 `MyBrain/verify/` に配置して使う。

1. `preflight`: Figma証跡、変更前の実ブラウザ証跡、spec、DOM対応表、component manifest、page coverageをそろえ、入力ハッシュを固定する。
   可変テキスト要素の高さも preflight で検査する。`text` / `innerText` / `textPattern` / `lineCount` のいずれかを持つ要素が `height` を単一値（幅が `tolerance` 以下のレンジを含む）で宣言し、その値が `lineHeight × lineCount` で説明できない場合は **SPEC FAIL** とする。Figmaの矩形高さはpaddingを含むため、その値をCSSの `height` へ直写した実装は、Figmaのダミー文言のままなら実測が一致して合格し、文言が変われば崩れる。可変テキストのspecは `[min, max]` で書き、例外は `note` に `fixed-height-reason: <根拠>` を残した場合に限る。
2. `checkpoint`: コンポーネントごとにCDP数値検証を行い、painted要素はブラウザ画像とFigma参照画像の差分を測る。PC/SPを含むcheckpointは同一Chrome process / CDP sessionのbatchで撮影し、document・font・画像・selectorの条件待機後に比較する。固定秒数待機やviewportごとのChrome起動は合格証跡に使わない。maskを使う場合はFigma根拠・path・SHA-256・`exclude`をpreflightで凍結し、空mask・全面mask・未宣言maskを拒否する。
   画像差分の閾値はビューポート別に宣言できる（`visualThresholds`）。既定の厳格値1%を超える閾値は、`visualThresholdBasis` に**実測した下限とその取得方法**を40文字以上で書かなければpreflightがFAILする。閾値の上限は5%。閾値は「実測した下限」と「実際に検出できた最小の誤り」の中間に置く。高密度の日本語テキストが占める領域はラスタライズ差だけで下限が上がるため、PCとSPを同じ閾値にすると片方が素通しになる。
   閾値超過の原因は**面積ではなく差分画素の座標分布で特定する**。差分画像の差分画素を行・列へ集計し、原因領域を決めてから対処する。maskを当てた場合は `diffPixels` が実際に減ったことを確認する。減っていなければ前提が誤りで、maskは分母だけを縮めて比率を悪化させる。
   **HTML/PHPを変更したscopeはW3C証跡を必須にする。**`w3c-check.mjs` で対象URLを検証し、`scope.w3cEvidencePath` へ登録する。証跡は検証時点のテンプレートのSHA-256を持ち、`close` が現在の内容と一致することを確認したうえで `errorCount === 0` を要求する。実行できない場合は `scope.w3cSkip = { reason }` を宣言する（合格にはならず `not-recorded` として残り、完了報告の未確認リストへ転記する）。
3. `close`: Sass build、単位lint、必要なPHP lint、PC/SPのspec全件、全checkpoint証跡を確認する。spec全件には、矩形、余白、font-size、line-height、letter-spacing、文言、明示改行、描画行数、色、背景、角丸、gap、状態を含める。`close-report.json` にSPEC / LAYOUT / VISUAL別のFAIL件数を保存し、すべて0であることを合格条件とする。

Figma照合はコーディングの反復内でだけ実行する。Git hook、commit、push、deployには登録しない。

## 4. ページ全体カバレッジ

- L1でPC/SPページ全体のメタデータと、全セクションのpage coverageを作る。
- `target` セクションは `next`、`current`、`verified` の状態を持つ。共有ヘッダー・フッターなど対象外の文脈は `context` とする。
- **先行scopeで検証済みの区画は `completed` とする。** `deferred`（未着手・後続scope必須）と混同しない。2件目以降のscopeで完了済みを `deferred` と書くと、`followUpScope` に既に走ったscopeを指す偽の記録が残る。`completed` は `figmaNodeIds` の対・`completedByScope`・`closeReportPath` を必須とし、**参照先のclose-reportが実在し、当該sectionを検証済みtargetとして列挙し、SPEC/LAYOUT/VISUALがすべて0であること**まで検査する。「完了した」という自己申告だけでは通らない。`completed` は今回のscopeの合格件数（`targetSectionCount`）には含めない。
- **`sections` は `inventory` と同じ並び**にし、`inventory` の並びは Figma ページ証跡のセクション順に揃える。順序が実際のページと違うと、レビュアーは抜けを目視で追えない。
- **coverage は `scopeId` を持ち、gate manifest の `id` と一致させる。** 先行scopeのcoverageを複製すると `deferred` の `reason` などscope固有の記述が前のscopeのまま残り、`reason` は非空文字列なら通るため検証器が素通りする。`scopeId` の不一致で落とすことで複製の提出を防ぐ。変更せず再利用する後続scopeは `sharedWithScopes` に明示する。
- component manifestの各要素は1つのtargetセクションへだけ割り当て、`sectionId` と一致させる。
- **反復UIの完全性**：全componentは`repeatItems`を宣言する。反復なしは空配列と20文字以上の`repeatItemsReason`を必須とする。反復ありは各itemの`itemId`、PC/SPのFigma node ID、PC/SPのDOM selectorを列挙する。specの各viewportは`repeatViewport`をpcまたはspとして宣言し、preflightは各item selectorとnode map inventoryを両viewportで照合する。
- **反復UIはcomponent manifestのepeatItemsへ全可視itemのPC/SP Figma nodeとviewport別DOM selectorを列挙する。**preflight は各selectorが対応viewportのspecに存在することを双方向照合し、1件でも欠ければFAILする。
- page coverageは独立レビューで現在のハッシュに対する承認を得る。承認またはハッシュ一致がなければ編集を開始しない。
- 最終 `close` は全targetが `verified` の場合だけ許可する。

## 5. 未確認と失敗の扱い

Figma取得、Figma参照画像、実ブラウザ接続、CDP実測、`C:\AI\web-development\rules\w3c-validation.md` に定めるW3C検証のいずれかができない場合、推測で代替しない。理由と未確認範囲を記録し、対象の実装完了・Figmaどおり報告をしない。

## 6. 合否基準との対応

- 静的検証・数値検証・描画検証の三層とそれぞれの合格条件: §1
- Figma取得値・参照画像・spec・全件対応表という実測の前提と証跡: §2
- 実装中のゲート（`preflight` / `checkpoint` / `close`）、条件待機、mask凍結、`close-report.json` のFAIL 0件: §3
- ページ全体の網羅（page coverage、独立レビュー承認、全target `verified`）と最終 `close` の許可条件: §4
- 取得・実測・W3C検証ができない場合の扱い（推測での代替禁止、未確認範囲の記録、完了報告の禁止）: §5
- 可変テキスト要素の固定高さ（Figma矩形高さのCSS `height` への直写禁止）とその例外条件: §3

## 参照

- `rules/figma-spec-pipeline.md`
- `rules/figma-mcp-implementation.md`
- `rules/figma-image-export.md`
- `templates/verify/README.md`
- `spec/13-accessibility.md`

## 編集履歴

- 2026-07-29 codex: verify-layoutの測定対象拡張（line-height、文言、改行・行数、角丸、gap等）をQ-09の合否契約へ明記。
- 2026-08-06 claude: 可変テキスト要素の固定高さ検査を §3-1（preflight）へ追記し、§6 に対応行を1行追加した（owner承認。STATE.md [88][89][92][93]）。実装は `templates/verify/figma-gate.mjs` の `assertVariableTextHeight`。新設のSPEC FAIL条件であり、codexの独立批評（[89] 合格 / [93] 合格）を経ている。忠実度ベンチマークは合否を判定しないため §6 には**入れない**と決めた（[93] A-2）。
- 2026-07-30 claude: §6「合否基準との対応」を復元した（owner承認 P-6。STATE.md [78][79]）。他12設問と同じ形式に揃え、`LOOP.md` ゴール条件2「各回答に検証可能な合否基準が付いている」を満たすため。新しい合否基準は追加しておらず、既存 §1〜§5 への対応を明示しただけである。
