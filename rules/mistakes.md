---
type: rule-history
status: permanent
date: 2026-07-17
topic: Figma実装のやらかしと再発防止
tags: [Figma, history, mistakes]
---

# Figma実装のやらかしと再発防止

> このフォルダは、案件をまたいで再発するFigma実装失敗の正本とする。案件固有のURL、Figma node-id、文言、寸法、HTML、アセット、実測値は各案件の `MyBrain/rules/corrections.md` に保存する。

Figmaデザインの取得・実装・実測照合で起きた失敗と再発防止を記録する。

---

## 2026-08-26 正本リポジトリの「作業ツリー」を配布源にして、案件のゲートを2回停止させた

**同じ失敗の2回目。**1回目は 2026-08-25、2回目は 2026-08-26 で、どちらも同じ日のうちに再発した。

- やらかし：`C:\AI\figma-to-code\templates\verify\figma-gate.mjs` を案件へコピーしたところ、
  案件のゲートが `manifest.scope.startDeclarationPath is required` で全面停止した。
  正本リポジトリの**作業ツリーが未コミットの新契約WIP**（3220行）で、案件は upstream HEAD 相当（2925行）で
  動いていた。案件側 `MyBrain/` はgit管理外のため、上書き前の状態を復元できない。
- 原因：`templates/verify/` にあるファイルを「正本の最新」と見なし、**そのファイルが未コミットの
  変更を持っていないかを確認しなかった。**1回目の後に再発防止を STATE.md へ書いたが、
  規則ファイルへ昇格させず、2回目は同じ手順をそのまま繰り返した。
- 再発防止（手順で塞ぐ。注意ではなく）：
  1. 正本から案件へファイルを配布する前に、**必ず** `git -C C:/AI/figma-to-code status --porcelain <path>` を実行する。
     出力が空でなければ配布しない。作業ツリーの内容は「正本の最新」ではない。
  2. 未コミットの変更を含むファイルを配布する必要がある場合は、
     `git show HEAD:<path>` を土台に、配布したい変更だけを再適用したものを配る。
  3. 案件側 `MyBrain/verify/` はgit管理外で復元できない。**上書き前に退避を取る。**
  4. 配布後は必ず案件側の e2e（`figma-gate.e2e.mjs` 等）を実行し、PASS を確認してから次へ進む。
     2回とも、e2e を回した時点で初めて破壊に気づいた。回さなければ気づけない。

## 2026-08-24: verification
<!-- loop-log: {"id":"declared-value-read-as-measured-value-20260824","kind":"mistake","failureClass":"verification","recurrenceKey":"declared-value-read-as-measured-value","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.mjs"]} -->
- 指摘：絶対配置要素のCSS宣言値がデザインのルート基準座標と同じ数字であることを確認しただけで「デザインどおり」と報告した。包含ブロックがヘッダー直下から始まるため、実描画はヘッダー高さぶん下にずれていた。片方のブレークポイントでは高さの指定自体も別物だった。
- 今後：位置と寸法をデザインと突き合わせるときは、CSSの宣言値ではなく実測層（getBoundingClientRect）の値を根拠にする。宣言値の一致は座標の一致を意味しない。宣言値だけを読んだ段階では「一致」「デザインどおり」と書かず未検証として扱う。

## 2026-08-24: verification
<!-- loop-log: {"id":"verification-definitions-omit-the-deliverable-20260824","kind":"mistake","failureClass":"verification","recurrenceKey":"verification-definitions-omit-the-deliverable","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.mjs"]} -->
- 指摘：specとpage-coverageが、そのscopeが実装した当のもの（背景と補助ナビ）を1件も測っていないまま多数の測定がPASSし、close直前まで気づかなかった。page-coverageのinventoryはデザインのルート直下ノードを6件取りこぼしていたが、既存の検査はinventoryの網羅性をデザイン側と突き合わせないため素通りした。specの測定先URLがgateの検証URLと別物だった点も検出されなかった。
- 今後：checkpointを回す前に、そのscopeが実装した要素のセレクタがspecに存在することと、page-coverageのinventoryが凍結済みデザインmetadataのルート直下ノードをノードIDで全件含むことを機械的に突き合わせる。specのURLとmanifestの検証URLの一致も検査する。合格件数の多さは、実装した当のものを測った証拠にならない。

## 2026-08-23: frozen-manifest-edited-after-preflight
<!-- loop-log: {"id":"mistake-frozen-manifest-edited-after-preflight-20260823","kind":"mistake","failureClass":"frozen-manifest-edited-after-preflight","recurrenceKey":"frozen-manifest-edited-after-preflight","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.mjs"]} -->
- 指摘：preflight後にgate manifestのcorrectionReceiptPathとchangeTargetsを書き換え、scopeが回復不能になった。凍結値はgate stateとpage-coverage-runtimeの2箇所に残るため、closeのassertFrozenInputsが必ず落ちる。preflight時点のmanifest内容は保存されないため復元できず、受領証を打ち切って再preflightするしか道が無くなった。訂正受領証の再記録では解決しない(受領証ファイル自体のハッシュも凍結されているため、再記録すると別の凍結検査が壊れる相互排他になる)。
- 今後：preflight後にmanifestを編集しない。対象や訂正受領証を差し替える必要が生じたら、編集ではなく打ち切って再preflightする。編集してしまった場合は、受領証の辻褄合わせを試みる前にassertFrozenInputsの全項目を実測し、回復可能かを先に判定する。figmaとcodingの両方を使うscopeは、figmaを完了させてからcodingを通す。逆順で始めると、Figmaをやり直す必要が生じた時点でcoding受領証を外すしかなくなる。

## 2026-08-22: mcp-access-context-confusion
<!-- loop-log: {"id":"mistake-mcp-access-context-confusion-20260822","kind":"mistake","failureClass":"mcp-access-context-confusion","recurrenceKey":"mcp-access-context-confusion","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-mcp-implementation.md"],"verifierTargets":["templates/verify/figma-gate.mjs"]} -->
- 指摘：Figma MCPのアクセスエラーを、アカウント自体の編集権限なしと誤って断定した。
- 今後：MCPのアクセスエラーはその接続での取得不能として報告し、実アカウントの編集可否とは分けて扱う。

## 2026-08-05 PowerShellが未引用セレクタの`>`をリダイレクトとして解釈し、scope外ファイルを作成した
<!-- loop-log: {"id":"mistake-powershell-selector-quoting-20260805","kind":"mistake","failureClass":"powershell-selector-quoting","recurrenceKey":"powershell-selector-quoting","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器にはPowerShellの引用解釈を再現する負のE2Eが存在しないため。"} -->
- やらかし：Figma訂正scopeの証跡生成で、DOMセレクタを含む長い `node -e` コマンドをPowerShellへ直接渡した。`> article` が出力リダイレクトとして解釈され、テーマルートに0バイトの未追跡 `article` が作成された。scope lockが対象外変更として正しくblockedになり、preflight前に作業が停止した。
- 原因：データとして扱うべきCSSセレクタの`>`・`<`・`|`・バッククォートを、シェルの構文として解釈されない形に分離せず、長いインラインスクリプトへ混在させた。コマンド失敗直後に作業ツリーを確認しなかった。
- 再発防止：Figma証跡・spec・manifestを生成する際、CSSセレクタ、HTML、Markdownを含む処理を `node -e` へ直書きしない。編集は `apply_patch` を優先し、外部ワークスペースで使えない場合は内容をファイルとして明示的に管理した短いスクリプトへ分離して実行する。PowerShellへ渡すデータに`>`・`<`・`|`・バッククォートが含まれる場合は、実行前にインライン文字列を使わない構成へ置き換える。コマンドが失敗したら、次の書込み前に必ず `git status --short` とscope-lock verifyを実行する。

## 2026-08-03: 証跡ファイルの複製で、前scopeの記述をそのまま提出した
<!-- loop-log: {"id":"mistake-copied-evidence-semantic-drift-20260803","kind":"mistake","failureClass":"copied-evidence-semantic-drift","recurrenceKey":"copied-evidence-semantic-drift","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器には文章の意味的な証跡ずれを再現する負のE2Eが存在しないため。"} -->

**同じ型の失敗の3回目。**過去2回はいずれも「複製・書き換えの際に、片方だけを直して整合を崩した」もの。

- 2026-08-01: 案件側コピーだけを見て正本の欠落と断定した
- 2026-08-02: spec / node map を書き直した際に葉ノードの登録を落とした（独立レビューで発覚）
- 2026-08-03: 後続scopeのpage coverageを先行scopeから複製し、`deferred` の `reason` 25件と並び順を前のscopeのまま提出した（独立レビューで発覚）

**原因：**複製したファイルを「構造は正しいから中身も正しい」と扱っている。検証器が通ることを、内容が正しいことの代わりにしている。今回の `reason` は非空文字列なら通るフィールドで、機械検査を通り抜けた。

**再発防止：**
1. 証跡ファイルを複製したら、**scope固有のフィールドを列挙してから**着手する。列挙せずに部分的に直さない。今回なら `deferred[].reason` / 並び順 / `_comment` / `plannedScopes` が該当した。
2. 「非空文字列であること」しか検査していないフィールドは、複製時に必ず陳腐化すると考える。そのフィールドがscope固有の内容を持つなら、**scopeの同一性を別途機械検査する仕組みを足す**（今回は coverage の `scopeId` と manifest `id` の一致を必須にした）。
3. 独立レビューに出す前に、自分で「前scopeの固有名詞が残っていないか」を全文検索する。

---

> [!note] 旧呼称について（2026-07-29）
> 共通Vaultは `C:\AI\vault`（旧 `C:\AI\MyBrain`）。以下の過去記録に出る「共通MyBrain」は
> 当時の記録としてそのまま保存している。現在の参照先は `C:\AI\vault` と読み替える。
> 案件リポジトリ内の `MyBrain/` は改名していない。

<!-- ここから下に追記していく。最新を上に。 -->

<!-- loop-log-schema: v1 -->

## 2026-08-03
- やらかし：Figma MCPの公式レート表を列ずれのまま読み、Starterの`Full` seatでも読取MCPが200回/日使えると誤答した。実際はStarterではseat種別にかかわらず読取系MCPが6回/月であり、現行のFigma-to-code工程を継続できない。
- 原因：`whoami` が返すseat名だけで判断し、plan×seatの公式上限表・Starter plan overview・現行作業の実際のMCP呼出量を突き合わせなかった。
- 再発防止：Figmaのプラン／seat／MCP上限を答えるときは、(1) `whoami` で現行planとseatを取得、(2) 公式のrate limitsでplan列とseat行を対応付け、(3) Starter plan overviewでDev Mode可否を確認、(4) 対象案件の読取MCP呼出実績と比較する。無料化の可否を`Full`という名称だけで判断しない。

## 2026-08-02 全面書き換えの際、付随する記録・証跡の更新を取りこぼした
- やらかし：誤ったfileKeyを訂正するため node map と spec を全面書き換えした際、(1) 直前に追加していたH3-01 leafの登録を落とした、(2) 訂正記録の中で旧ファイル前提の「事実」行だけが残り、同じ記録内の新しい行と矛盾した、(3) component manifest の参照画像メモが旧ノードIDのまま残った、(4) layers証跡のleafがPC分だけでSP分が無いのに、specはSP leafを `metadata` 由来と宣言した。独立レビューで4件すべて指摘された。
- 原因：ファイル単位で「作り直す」ことに意識が向き、**その成果物を参照している側・説明している側の記録を更新対象として数えなかった**。specとnode mapは書き直したが、それらの根拠となる証跡ファイルと、それらを説明する訂正記録は別物として扱ってしまった。
- 再発防止：成果物を全面書き換えするときは、書き換え前に「この値を参照・説明している他ファイル」を列挙してから着手する。最低限、同じscopeの spec / node map / mapping / layers証跡 / component manifest / 訂正記録の6種を1組として扱い、片方だけ更新しない。specが `metadata` / `design_context` を取得元として宣言した値は、対応する保存済み証跡が同じviewport分そろっていることを確認する。訂正記録は行を追加するだけでなく、**古い前提で書かれた行を撤回・訂正する**。

## 2026-08-01 古いmanifestのfileKeyを流用し、別のFigmaファイルを見て誤診断した
- やらかし：新しいscopeを立てる際、案件の既存manifest（2週間前作成）に書かれていた fileKey をそのまま使い、それが現行のデザインファイルか検証しなかった。実際にはオーナーが使っている現行ファイルは別のfileKeyだった。古いファイルでは対象レイヤーが `hidden="true"` だったため「実装が非表示レイヤーの寸法を使っている」と誤診断し、存在しない不整合についてオーナーへ3択の判断を求めた。現行ファイルでは同レイヤーは表示されており、実装は正しかった。node map・spec・page coverage・参照画像・証跡・訂正記録まで、成果物一式が誤ったファイルを参照した状態で作られた。
- 原因：fileKeyを「案件に1つしかない固定値」と暗黙に扱った。作業途中で既存evidenceのノード対応が実物とずれている事実（あるノードが記録と別セクションだった）に気づいていたのに、ノードIDの誤りとしてのみ処理し、**ファイル自体が違う可能性へ疑いを広げなかった**。
- 再発防止：scopeを立てるとき、fileKeyは既存manifestから流用せず、**オーナーが提示した最新のFigma URLから抽出する**。URLが無い場合はオーナーに現行ファイルのURLを求める。流用する場合は、対象ノードを引いてレイヤー名・寸法・可視状態が現行デザインと一致することを確認してから使う。既存evidenceと実物のズレを1件でも見つけたら、ノードIDだけでなくfileKeyの妥当性も同時に検査する。

## 2026-07-27（2）
- やらかし：`spec/` に定義された検証機能が案件側の検証スクリプトに無いことを見つけ、その機能を必要とする事例が案件に実在するか確認しないまま「埋めるべき穴」「投資対効果が最も高い」と断定して実装を追加した。後に案件の成果物を調べたところ、その機能を宣言したゲートは0件、画像差分対象のコンポーネントは全件がその機能なしで合格済み、対象ページには機能が前提とする動的要素自体が存在しなかった。オーナーの指示で追加分を全て削除し原状復帰した。
- 原因：`spec/` は案件非依存の共通仕様であり「いずれかの案件で必要になり得る」を意味するに過ぎないのに、「この案件で必要」と同一視した。加えて他エージェントの提案の一方を根拠付きで却下した後、もう一方は受け入れてから裏付けを探しており、仕様と実装の乖離を必要性の証拠と取り違えた。
- 再発防止：検証機能の追加を提案・実装する前に、案件の成果物（`gate-*.json` / `spec-*.json` / component manifest）をgrepし、その機能が過去に宣言・要求された件数を数える。0件なら「仕様上は可能だが本案件に実需要なし」と明記し、追加しない。追加する場合は、その機能が無いと検証が成立しない対象を1件特定してから着手する。対象ページに動的要素があるかは、テンプレートのデータ源（CMSクエリやフィールド取得の有無）を確認すれば着手前に判定できる。

## 2026-07-27
- やらかし：`templates/verify/` の検証スクリプトについて、案件側 `MyBrain/verify/` のコピーだけをgrepして機能が無いことを確認し、「仕様書にはあるのに実装されていない」と実装欠落として断定・報告した。実際はテンプレート正本に完全実装が存在し、案件側コピーが追従していないだけだった（同期漏れ）。欠落と同期漏れでは必要な作業も工数もまったく違う。
- 原因：`templates/verify/` を案件側へコピーして使う配布方式なのに、案件側コピーを実装状況の判断材料として扱い、正本側を確認しなかった。仕様（`spec/`）と案件側コピーの2点だけを比較し、その間にある正本を飛ばした。
- 再発防止：`templates/verify/` 由来のスクリプトについて「未実装」「仕様と乖離」と判断する前に、必ず正本・案件側コピーの両方をgrepし、`diff` で世代差を確認する。片方だけを見た結論は「案件側コピーでは未確認」と限定して書き、実装欠落と断定しない。仕様→実装の乖離を報告するときは、確認した3点（`spec/` の記述、`templates/verify/` の正本、案件側コピー）をすべて明示する。
- 補足：同期は上書きと決めつけない。案件側コピーは独自拡張が入って正本から分岐していることがあるため、`diff` で案件側にのみ存在する行を確認し、独自拡張があれば全体コピーではなく該当機能だけを移植する。上書き前にバックアップを取る（案件側 `MyBrain/` はgit管理外でgitの保険が効かない）。

## 2026-07-27: PC/SP本文の二重HTMLを温存した修正

- やらかし：既存の `*-pc` / `*-sp` 本文をCSSで表示切替する構造を、Figma修正時に確認せず温存し、SP側だけへ`<br>`を追加して見た目を合わせた。
- 原因：視覚差分を優先し、編集前の同一DOM検査を実行しなかった。
- 再発防止：`figma-gate preflight` は `scope.responsiveHtml.sourceFiles` の同一本文を検出して失敗する。本文は単一DOMを正とし、改行の視覚調整をPC/SP二重HTMLの例外理由にしない。

## 2026-07-09
- やらかし：FigmaヘッダーPCナビの位置検証で、最初にFigma metadata の実値ではなく推定した期待値をspecに入れ、そのspecで確認したため、ズレを正しく検出できなかった。
- 原因：Figma取得値と推定値を区別せず、推定値を検証基準として扱った。
- 再発防止：Figma URL付きの位置・サイズ・余白・フォント検証では、specの各期待値に必ず取得元（metadata/design_context/screenshot実測/asset実測）を持たせる。取得元がない値は検証基準に入れない。推定値で作ったspecは無効とし、Figma再取得後に作り直すまで実装・完了報告しない。

## 2026-07-09
- やらかし：共通Vaultの figma-spec-pipeline.md / corrections.md に、特定案件の名前・案件レポートのパス・案件固有の基準幅を書いた。共通と案件固有の分離ルール（CLAUDE.md 2層構造）に違反し、他案件では誤った前提になる記述を全案件共通ルールへ混入させた。
- 原因：案件での実例をそのまま共通ルール本文に転記し、「案件側ファイルへの参照形に書き換える」汎用化の工程を挟まなかった。
- 再発防止：共通Vaultを編集したら、commit前に `git diff` を確認し、案件名・案件リポジトリのパス・特定案件の数値/ノードID/URLが含まれていたら、案件側 `MyBrain/` へ移すか参照形（「案件側 `MyBrain/rules/...` を参照」）に書き換えてからcommitする。実例を書きたい場合は `XXXX:YYYY` のようなプレースホルダーにする。

## 2026-07-07
- やらかし：OPEN案件のSPメニュー修正で、共通MyBrainのFigmaスペック駆動パイプラインを守らず、実ブラウザの375px実測照合をしないまま「Figma基準で修正した」と報告した。結果、PC用flex指定（justify-content:flex-end / align-items:center / gap）がSPメニューに残り、Figmaと大きくズレた。
- 原因：Figma MCPの値とコードの静的確認だけで十分だと誤認し、`C:\AI\figma-to-code\rules\figma-spec-pipeline.md` のフェーズ3（CDP実ブラウザ実測）と、`corrections.md` の診断表（DOM/CSS/実測/原因確定）を実行しなかった。
- 再発防止：Figmaデザイン修正では、コード変更後に必ず375px/PC幅の実測照合を行い、主要値がPASSするまで完了報告しない。特にメニュー・モーダル・アコーディオンは「開いた状態」を強制して測り、親flex/gridの継承（justify-content / align-items / gap / flex-direction）を最初に確認する。

## 2026-07-06
- やらかし：OPENトップSPのFV実績サマリーで、design_contextが先頭項目だけ text-[40px]/[28px]（他項目は27.3/19.11px）を返したのを「Figma実値」としてそのままCSSに転写した。実際はFigmaのスケール操作の残骸データで、ノードのレンダリング上は3項目とも同サイズ。結果、1271px以下で先頭の「500+」が巨大化し、line-height 24.57px固定との組み合わせでラベルに11.9px重なり、background-clip:text のグラデーションも欠けた。
- 原因：取得値の中に明らかな外れ値（1項目だけ約1.47倍）があったのに、「Figmaが返した値＝正」としてレンダリング実物との突き合わせをしなかった。同ノードの兄弟要素と比率が揃わない値を疑うチェックが手順に無かった。
- 再発防止：design_contextの数値に「兄弟要素間で比率が不揃いな外れ値」（スケール残骸の典型：一部だけ元コンポーネントの値）を見つけたら、転写する前に必ず対象ノードの get_screenshot を撮り、グリフ実寸で外れ値が実在するか確認する。確認結果はspecのnoteに残す。またspecには「同種要素のfont-size一致」を検証項目として入れる。
- 補足：崩れの検出自体はCDP実測（グリフink範囲 vs 要素box、ラベルとの重なり量）で機械的にできた。診断スクリプトは案件側 MyBrain/verify/ 方式を使う。
