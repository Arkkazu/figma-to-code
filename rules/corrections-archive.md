# corrections-archive.md — 退避済み

> 上限を超えた分を日付の新しい順にここへ移す。**削除ではなく退避**で、本文は当時のまま保存する。
> セッション開始時の必読対象ではない。必要なときだけ `grep -n "<対象>"` で引く。

---

<!-- ここから下に退避していく。最新を上に。 -->

## 2026-07-17
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- 指摘：Figma固有の詳細手順・検証キット・履歴が共通MyBrainにも存在し、正本が二重だった。
- 今後：Figma固有の正本は C:\AI\figma-to-code に一本化する。Figma照合はコーディングの各反復内でのみ実行し、Git hook・commit・pushでは実行しない。

## 2026-07-16
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- 指摘：既存実装同士の統一方針について、実装・Figma・実際の動作を比較せず、質問に引っ張られて結論を即答し、その直後に異なる判断を示した。
- 今後：統一・採否・挙動の判断は、対象実装・Figmaモーション・実ブラウザ挙動の根拠を照合してから回答する。根拠未取得の段階では結論を出さず、未確認として確認に進む。

## 2026-07-16
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- 指摘：Figma実装で、コード変更が済んだことを作業の区切りにし、V2の独立レビュー・postflight・ハッシュ照合が未完のscopeを残したままcommit/push段階へ進んだ。未検証が存在する状態自体がコーディング完了ではない。
- 今後：Figma由来の変更は、対象となる全視覚ソースがV2の独立レビュー承認・全checkpoint PASS・close後のハッシュ照合を満たすまで「Figma実装完了」と扱わない。未完scopeがあっても、commit / push / deployは止めない（2026-07-18 更新）。

## 2026-07-16
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- 指摘：Figma/CDPのチェックをコーディング後やpush直前の独立した全件再検証フェーズとして始め、実装作業から切り離して時間を膨らませた。
- 今後：チェックはコーディングの各反復内だけで行う。編集前のpreflight、対象コンポーネント実装直後のcheckpoint、当該scopeを閉じる直前のcloseを連続した作業単位にし、PASS前に次の実装へ進まない。commit / push / deploy時に新たな広域チェック作業を開始しない（2026-07-18 更新）。



# 2026-07-16
- 指摘：コミット時に不要な全件Figma検証を実行する一方、コーディング反復中に必須の生成HTML W3C Nu Validator検証を省略した。
- 今後：HTML・テンプレート・ARIAを変更した反復では、HTML確定時に `C:\AI\web-development\rules\w3c-validation.md` を適用する。合格基準・未確認時の扱いは同ファイルに従い、検証はコーディング反復中に行う。commit / push 時に再実行しない。

## 2026-07-15
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- 指摘：Figma実装ループ開始時に、対象Figmaページ全体を既定範囲として扱う規則がLOOP.mdに無く、毎回対象範囲を指定しなければならなかった。
- 今後：開始指示は対象ページ全体のフレームを指すnode-id付きFigma URLだけを必須とし、そのURLが指すページ全体を既定対象にする。FV等の部分修正だけ範囲を追加指定する。実装・検証の反復単位は既定どおり1セクションとする。

## 2026-07-15
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- 指摘：ページ全体を対象とするFigma実装ループの例で、共通ヘッダー・フッターを既定の実装対象かつ優先対象として含めた。
- 今後：開始指示では実装対象と除外対象を明記し、トップページ実装では共通ヘッダー・フッターを対象に含める。下層ページ実装では共通ヘッダー・フッターを除外し、必要な位置・境界だけ文脈として確認する（spec・checkpoint・変更対象には含めない）。

## 2026-07-15
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- 指摘：Figma実装ループの開始指示で「対象範囲」の例を1セクションに限定し、ページ全体を作業スコープにできることと、1イテレーションの粒度を区別して示さなかった。
- 今後：開始指示ではページ全体を対象範囲として指定できると明記し、実装・検証は共有部品優先で1セクションずつ反復する、というスコープとイテレーション粒度の違いを必ず分けて説明する。

## 2026-07-15
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- 指摘：共通MyBrainとLOOPの役割が並列に扱われ、LOOPの手順や担当名が上位の規則・オーナー指示を上書きできるように読めた。
- 今後：共通MyBrainを案件横断の上位規則とし、LOOPはFigma作業のpreflight・checkpoint・closeを機械的に強制する下位の実行手順として扱う。LOOPが上位規則と矛盾する場合は編集せず、STATE.mdへ記録して確認する。

## 2026-07-13
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- 指摘：Figmaコンポーネント内の非表示矢印レイヤーを見て、可視の`tune`アイコンではないSVGを実装した。
- 今後：Figmaのコンポーネント/instanceを実装するときは、Plugin APIで`visible`状態と子レイヤーの実表示を確認し、可視のSVGアセット・外枠・内側ベクターを個別に照合してから採用する。生成コードに現れた最初のassetや非表示variantを推測で採用しない。

## 2026-07-13: Figma証跡を実行ゲートで強制する
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）

Figma案件では、対象nodeと可視レイヤーの取得結果、採用アセットのFigma export確認、変更前後の実ブラウザ矩形・スクリーンショット照合を `figma-gate.mjs` のpreflight/postflightで機械的に確認する。いずれかが欠けた場合は編集・Figma実装完了に進まない。手順文書だけを根拠にした「確認済み」は禁止する。commit・push・deployにはこのゲートを適用しない（2026-07-18 更新）。

## 2026-07-09
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
<!-- loop-log: {"id":"correction-provenance-spec-20260709","kind":"correction","failureClass":"unverified-figma-value","recurrenceKey":"unverified-figma-value","action":"strengthen","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.mjs","templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘：Figma実装・修正で、Figmaから取得していない推定値をspecや検証基準として使うな。推定で確認した扱いにするな。
- 今後：Figma案件のspec/検証基準には、Figma MCPの metadata / design_context / screenshot 実測 / 既存アセット実測など、出典が明確な値だけを書く。計算・推測・見た目の勘で補った値は `inferred` として別枠に隔離し、PASS判定の期待値に使わない。未取得値がある場合は追加取得してから進め、取得できない場合は未確認として止める。

## 2026-07-09
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- 指摘：CodexにFigma URLからFigma MCPでコーディングさせると、正確にコーディングも確認もできない。ルールを参照情報として読むだけで、着手時に工程を強制できていない。
- 今後：Figma URL付きの実装・修正タスクでは、コードを1行でも触る前に `C:\AI\figma-to-code\rules\figma-spec-pipeline.md` フェーズ0の「着手宣言」（①fileKey/nodeId ②specファイルのパス ③固定チェックリスト）を最初の報告として出力する。着手宣言なしのコード編集、チェックリスト未完了のままの完了報告は差し戻し対象。node-idが無いURL・未取得欄が残るspecでは実装に進まず停止する。

## 2026-07-09
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- 指摘：『MyBrainを読み飛ばしたり途中で勝手に区切ったら意味がない』という言い方は不適切。共通MyBrainは、その読み飛ばし・途中区切りを防ぐための強制工程である。
- 今後：Figma案件では、MyBrainの着手ゲート・固定チェックリスト・spec作成・lint・verifyを作業工程そのものとして扱う。『読んだが守れなかった』『途中で区切った』を許容しない。未完了項目がある場合は作業を完了扱いせず、解消するまで継続する。

## 2026-07-07
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- 指摘：Figma実装の完了報告に検証の証跡がなく、パイプラインが守られたかオーナー側で判定できない。
- 今後：Figmaデザイン実装・修正の完了報告には必ず①使用した spec ファイルのパス（`MyBrain/verify/spec-*.json`）②`lint-units.mjs` の実行結果（エラー0）③`verify-layout.mjs` の全PASSログ の3点を添付する。3点が揃わない報告は「完了」と書かず、実行できなかった項目を未確認として明示する。オーナーは3点が無い完了報告を差し戻してよい。

## 2026-07-07
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- 指摘：Figma実装チェックでSPメニューのアコーディオン実装とFigma指定の矢印/アイコン確認が漏れた。
- 今後：Figma照合では寸法・位置だけでなく、開閉UI、hover/open/closedなどの状態差分、矢印・plus/minus・外部リンク等のアイコン表示、`aria-expanded`などのアクセシビリティ属性もspec/実測対象に入れる。特にメニュー、モーダル、アコーディオンは「開いた状態」と「閉じた状態」の両方をCDPで確認する。

## 2026-07-06
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- 指摘：line-heightをremで書く規約逸脱があった（単位なしが規約）。規約逸脱を起こさない仕組みをMyBrainに入れること。
- 今後：SCSSの単位規約は目視ではなくlintで担保する。実装・修正したSCSSは `node MyBrain/verify/lint-units.mjs <対象scss>` をエラー0にしてからビルドする（検査内容と運用は `C:\AI\figma-to-code\rules\figma-spec-pipeline.md` フェーズ2）。規約に無い書き方を独自判断で発明しない。換算表に当てはまらないケースは未確認として止める。

## 2026-07-05
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- 指摘：Figma実装は「スペック駆動の閉ループパイプライン」で実行すること（banner背景色ミスの再発防止として、注意ではなく工程で塞ぐ）。
- 今後：Figmaデザイン実装（新規・修正とも）は必ず `C:\AI\figma-to-code\rules\figma-spec-pipeline.md` に従う。①実装前にspecファイル（案件側 `MyBrain/verify/spec-*.json`）を作り、未取得欄が残る間は実装しない ②実装後に `MyBrain/verify/verify-layout.mjs` でCDP実測照合し、全PASSするまで「完了」「Figmaどおり」と報告しない ③機械照合できない項目は未確認リストとして明示する。

## 2026-07-01
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- 指摘：レイアウトのズレ修正で、原因を決めつけて細部の数値から触り、同じ種類のミスを繰り返している。記録するだけでなく作業手順として強制する必要がある。
- 今後：「ズレている」「レイアウトが違う」と言われたら、コード変更前に必ず診断表（対象 / Figmaノード / 現DOM / 現CSS / display・grid・flex・order・modifier class・cascade上書き / ズレ方向 / 原因確定 / 変更する1プロパティ / 変更しないプロパティ）を埋める。診断表を埋められない場合はコードを触らない。
- 今後：確認順は必ず 1.DOM構造 2.修飾クラス 3.display/grid/flex/order 4.CSSカスケード上書き 5.親要素の幅・高さ・余白 6.子要素の幅・高さ・余白 7.テキスト・アイコン細部 とする。変更は1原因・1プロパティに限定し、変更後は生成CSSで上書き順と対象外への影響を確認する。

## 2026-07-01
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- 指摘：Figmaチェックでセクション外枠の開始位置・高さだけを見て、リード文の改行ズレを見落とした。チェック粒度が粗い。
- 今後：Figma照合ではセクション単位のy座標・高さだけでOK判定しない。FV・見出し・リード文・CTA・カード・リスト・画像・ロゴ・フッターなど主要パーツごとに、文言、改行位置、行数、font-size、line-height、letter-spacing、幅、高さ、x/y座標、余白、画像表示サイズをFigma実値と照合してから報告する。

## 2026-07-01
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- 指摘：コーディングルールに余白の作り方を追加する。基本的には上と左に余白を作り、`margin-bottom` や `margin-right` は基本的に使わない。
- 今後：SCSSを書く・修正するときは、縦方向の余白は後続要素の `margin-top`、横方向の余白は後続要素の `margin-left` を基本にする。`margin-bottom` / `margin-right` を使う場合は、Figma再現や既存仕様など明確な理由がある場合に限定する。

## 2026-06-27
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- 指摘：Figma実装で指摘箇所だけを局所修正し、同じセクション内の他画像・参照ミス・非表示箇所の確認が漏れていた。
- 今後：Figma由来の画像差分を直すときは、該当要素だけでなく同一セクション内の全画像・アイコン・背景・placeholder・CSS合成方法・拡張子/MIME不一致まで一覧で照合してから修正する。

## 2026-06-27
（2026-08-26 退避：legacy領域（loop-log-schema marker より後）の上限10件を超過したため、日付の古い順に退避。本文は当時のまま。marker より後の記録は figma-log-promote の再発判定の対象外である）
- 指摘：Codex セッションを再起動すると会話文脈が消えるため、Figma MCP 設定のような重要なやり取りはチャットだけで終わらせず MyBrain に残すべき。
- 今後：環境設定・MCP連携・重要な判断・次セッションへの引き継ぎが発生したら、その場で案件側 `MyBrain/daily/` や必要な `MyBrain/reports/` に要点を記録し、再起動後も参照できる状態にする。
