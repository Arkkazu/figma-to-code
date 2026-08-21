---
type: rule
status: permanent
date: 2026-07-05
topic: スペック駆動の閉ループパイプライン（Figma実装の必須工程）
tags: [Figma, MCP, verify, CDP, design-to-code, pipeline]
---

# スペック駆動の閉ループパイプライン

> Figmaデザイン実装（新規コーディング・修正の両方）は、このパイプラインに従って実行する。
> 目的：ミスの発生点（①取得漏れ ②転記・換算ミス ③検証漏れ）を注意力ではなく工程で塞ぐ。
> オーナー指示 2026-07-05（corrections.md 参照）により必須。
> **実行エージェント（Claude / Codex 等）を問わず適用する。** Figma MCP（mcp.figma.com）のツール名、検証スクリプト、spec書式は共通。実行に必要なテンプレートはFigma実装プレイブック `templates/verify/` にあり、案件側の前提は「`MyBrain/verify/` にコピーされたスクリプト」と「案件側 `MyBrain/rules/units.md`（単位規約）」の2つだけ。

```
Figma MCP ──→ spec（唯一の真実）──→ SCSS/PHP実装
                  │                     │
                  └──── 自動照合 ←── CDP実ブラウザ実測
                       （不一致 = 完了報告不可）
```

## フェーズ0: 着手ゲート — Figma URLを受け取ったら（2026-07-09追加）


## フェーズ0A: スコープロック（D-012）

Figma実装・修正の開始時に、案件側 MyBrain/verify/scope-<id>.json へ編集可能な正確な相対パスだけを列挙する。ワイルドカード、ディレクトリ指定、関連ファイル一式、ルール・検証基盤の予防的な追加は禁止する。

~~~powershell
node C:\AI\figma-to-code\tools\figma-scope-lock.mjs begin MyBrain/verify/scope-<id>.json MyBrain/verify/scope-<id>.state.json
node C:\AI\figma-to-code\tools\figma-scope-lock.mjs assert MyBrain/verify/scope-<id>.state.json <編集する相対パス>
~~~

assert は各ファイルの編集直前に実行する。checkpoint前とclose前には verify を実行する。

~~~powershell
node C:\AI\figma-to-code\tools\figma-scope-lock.mjs verify MyBrain/verify/scope-<id>.state.json
~~~

verifyが対象外の変更を検知したらscopeは blocked となる。以降の編集、checkpoint、close、完了報告を停止する。対象外パスを編集する必要が判明したが未編集の場合だけ、ownerの明示承認を記録したamendmentでamendできる。blocked後の自己拡張、対象外変更の自動復旧、通常scopeへの運用改善の混入は禁止する。詳細は rules/figma-scope-lock.md を正本とする。
<!-- executable-figma-gate -->
## 実行ゲート（Figmaコーディング中のみ）

Figma実装案件では、案件側 `MyBrain/verify/figma-gate.mjs` を使い、実装の反復内で次を実行する。テンプレートの正本は `C:\AI\figma-to-code\templates\verify\` にある。

- **編集前 `preflight`**：対象FigmaのPC/SP node、可視・非表示レイヤー、採用アセットのFigma export URL・形式・SHA-256、spec、DOM対応表、component manifest、component decision manifestをそろえる。decisionには既存コード検索証跡、reuse / extend / newの判定、コード側パス、根拠を記録し、newは独立承認・レビュー証跡を必須とする。manifest・spec・DOM対応表・component manifest・decision・Figma node/layer証跡・page coverageの入力ハッシュを固定する。変更前後の手入力矩形・スクリーンショットは合否に使わないため要求しない。
- **編集中 `checkpoint <manifest> <elementId>`**：コンポーネントを実装・変更するごとに、対象specのCDP実測と、painted要素のブラウザ撮影・Figma参照画像との差分照合を実行する。PASSするまで次のコンポーネントへ進まない。
- **編集後 `close`**：Sass build、単位lint、必要なPHP lint、PC/SPの全spec再実測を実行し、全componentを最終状態で再測定、painted要素はFigma参照画像との差分を再計算する。PASSしない限り「Figmaどおり」「作業完了」と報告しない。

環境判定 `workflow-preflight` は編集前ゲートの前段であり、代わりではない。上位層を読めない環境でFigma実装scopeを開始しないための検査である。`figma:gate preflight` は manifest を読むより先にこの判定を起動し、`cloud-restricted` または `workflow-preflight` 不在なら **SPEC FAIL** とする。正本の位置が既定と異なる環境では `FIGMA_TO_CODE_ROOT` で指定する。判定を迂回する環境変数は用意しない（テストダブルはgateのフィクスチャ内に限る）。

```bash
# environment gate: exits 2 when the upper-layer WORKFLOW.md files are unreadable
node C:\AI\figma-to-code\tools\workflow-preflight.mjs --assert-local

# source edit is prohibited until this exits 0
npm run figma:gate -- preflight MyBrain/verify/gate-<対象>.json --implementation-actor <actor> --implementation-context-id <context>

# run during each implementation iteration
npm run figma:gate -- checkpoint MyBrain/verify/gate-<対象>.json <elementId>

# run after the scoped implementation is complete
npm run figma:gate -- close MyBrain/verify/gate-<対象>.json
```

**Figma照合はコーディング中の反復だけで実行する。Git hook、commit、push、deployには登録・再実行しない。** 証跡が欠けたときは編集せず未確認として停止する。自己申告のskip・推測値・後付けの「確認済み」は認めない。

### 編集前ゲートの実効化（2026-08-01追加）

`preflight` はソースの基準線を取らないままだったため、**先に編集してから preflight を実行しても全工程が通っていた**。「編集後に通すもの」として扱う運用は、規律の問題である以前に検出不可能だった。これを塞ぐ。

`preflight` は git の作業ツリー状態を見て、`changeTargets` に**すでに変更のあるファイルが1つでもあればその場で SPEC FAIL** とする。判定は `git diff` / `git diff --cached` / `git ls-files --others --exclude-standard` の3種で行う。gitが使えない、またはリポジトリルート以外で実行した場合も FAIL とする（編集前後を区別できないため）。

- ビルド生成物は `scope.generatedTargets` に宣言する。`changeTargets` の部分集合に限り、`.` `/` 空文字 `..` 始まりは拒否する。**生成物でないソースをここへ逃がしてはならない。**
- 中断した作業を再開するなど、編集済みのまま開始する必要がある場合は `scope.preEditApproval = { instruction, paths[] }` にオーナーの明示指示と対象パスを記録する。**列挙のないパスのdirtyは通らない。**
- 判定結果は preflight state の `preEdit`（`dirtyPaths` / `changeTargetStatus`）に保存し、凍結入力として事後改変を検出する。

あわせて `preflight` は、そのscopeに**実際に効く規則だけ**を一覧出力する（変更ファイルの拡張子とpainted有無から判定）。必読は全層で約2,000行あり、全文の任意読みに依存すると守られないため、読む量を変更内容に比例させる。

### 測定幅の宣言（2026-08-01追加）

specに `viewportPolicy.scrollbars`（`hidden` または `visible`）を宣言する。未宣言は SPEC FAIL。`hidden` は `--hide-scrollbars` でスクロールバーの無い理想幅、`visible` は実ブラウザと同じスクロールバー幅を含めて測る。`margin: 0 auto` の中央寄せはこの差でx座標がずれるため、どちらで測ったかを証跡に残す。撮影（`checkpoint-capture`）もCDP実測と同じ値を使う。

> ルールを「参照情報」として読むだけでは工程が守られないことが自己監査で実証された（2026-07-09）。
> フェーズ0は**コードを触る前の宣言**をオーナーが検収できる形にするための開始ゲート。

- **URL分解**：`/design/<fileKey>/...?node-id=XXXX-YYYY` から fileKey と nodeId（`XXXX:YYYY`）を抽出する。**nodeIdを推測しない。** URLに node-id が無い場合は「対象node未特定」として停止し、オーナーに確認する。
- **取得コマンド**：`get_metadata` / `get_design_context` / `get_variable_defs` / `get_screenshot`（個別）。貼られたnode単体では不足する場合が多い。実装に影響するなら必ず併せて取得する：**親フレーム、同階層の兄弟、PC/SP対応node、hover・open・active等のvariant、instanceの元component**。
- **着手宣言（開始ゲート）**：SCSS/PHP/JSを1行でも編集する前に、最初の報告で次の3点を宣言する。**宣言の無いままコード編集を始めない。**
  1. 使用する fileKey / nodeId
  2. 作成・更新するspecファイルのパス（`MyBrain/verify/spec-*.json`）
  3. 下記チェックリスト（その時点の完了/未完了つき）
- **固定チェックリスト**（全項目を満たすまで「完了」「Figmaどおり」と報告しない）：

```text
[ ] scope manifestにこのscopeで編集可能な正確な相対パスだけを列挙し、scope-lock beginをPASSした
[ ] 各編集直前にscope-lock assertをPASSした
[ ] checkpoint前・close前にscope-lock verifyをPASSした（対象外変更0件）[ ] URLから fileKey / nodeId を抽出した（推測なし）
[ ] get_metadata / get_design_context を取得した
[ ] 背景色・色は get_variable_defs または個別 get_screenshot＋ピクセル実測で根拠を確定した（figma-mcp-implementation.md「背景色の確定手順」）
[ ] 親・兄弟・PC/SP対応node・hover/open等のvariantを確認した
[ ] design_context値の外れ値（兄弟間で比率が不揃い＝スケール残骸の疑い）を get_screenshot の実寸で検証した
[ ] spec-*.json を作成・更新した（文言・改行位置・行数を含む。未取得欄が残る間は実装しない）
[ ] 矩形に出ない性質（text-align / font-weight / 装飾）をPC/SP双方の design_context で比べ、specへ書いた
[ ] TEXTノードの文言を全件specへ書いた。実データで変わる文言は `textPattern` + `textPatternReason` にし、Figmaのダミー値を固定値として実装していない（PC/SP両方のノードを見て動的か判断した）
[ ] line-height を「Text nodeの高さ ÷ 行数」で検算した（トークンの%をそのまま採らない。最も行数の多い要素で検算する）
[ ] Figma値と現HTML/CSSの差分表を作った
[ ] Figmaノード↔実装DOMの全件対応表と未対応・余計な要素リストを作成した（書式は C:\AI\figma-to-code\templates\verify\figma-dom-mapping-template.md）
[ ] 機械可読なnode map（`MyBrain/verify/nodemap-<対象>.json`）を作成し、manifestの `scope.nodeMapPath` に登録した。`preflight` がFigma子ノード単位のカバレッジを検査してPASSした
[ ] `node C:\AI\figma-to-code\tools\workflow-preflight.mjs --assert-local` が exit 0 だった（上位層を読めない環境でFigma実装を開始しない。環境判定であり `figma:gate preflight` の代わりではない）
[ ] **1行も編集する前に** `figma:gate preflight` をPASSさせた（変更対象がgit上でcleanな状態で通した）
[ ] specに `viewportPolicy.scrollbars` を宣言した（`hidden` または `visible`）
[ ] カード・検索結果・表・リストなど反復要素は、PC/SPそれぞれの全可視itemをFigma順とDOM順で1対1に対応付け、title・label・`dt/dd`・補助文言・画像・リンク先を実DOMの出力値で照合した（先頭1件の抽出確認、親コンテナ寸法だけのPASS、ソース配列だけの確認は禁止）
[ ] component decision manifestを作成した（全componentを1件ずつ、Figma COMPONENT / INSTANCEは既存コード検索証跡付きでreuse / extend / newを判定。newは独立承認・レビュー証跡必須）
[ ] reuse / extendを選ぶ既存共通部品は、対象Figma nodeと現行部品の色・採用アセット（URL / SHA-256 / 形式）・通常/hover/open等の状態差分を個別に照合し、差分と採否をcomponent decision manifestへ記録した（未照合なら流用確定・実装開始を禁止）
[ ] component manifestの全componentにspacingOwnershipを記録した（rootPaddingはnone/internalのみ。外側のセクション間余白はparent-layoutの責務で、component root paddingにしない）
[ ] 実使用ページとコンポーネントページのDOM構造を照合した（見本DOMと実使用DOMのタグ・クラス構造を一致させる）
[ ] `scope.responsiveHtml.sourceFiles` に本文を出力する全テンプレートを列挙し、PC/SPの同一本文重複検査をPASSした（例外は意味・アクセシビリティ・性能の具体的根拠をmanifestに記録）
[ ] 画像・アイコンは C:\AI\figma-to-code\rules\figma-image-export.md に従い asset URL・実フォーマット・透過α・書き出し倍率を確認した
[ ] card / button / label / nav item など可変テキストを含む要素は、Figma上の固定高さをCSSの`height`へ直写せず、`C:\AI\web-development\rules\css-values.md`の可変テキスト要素ルールに従って`padding` / `min-height` / `line-height`で高さを作った。specの高さは `[min, max]` の範囲で書き、固定`height`を使う場合だけ `note` に `fixed-height-reason: <根拠>` を書いた（`preflight` の `assertVariableTextHeight` が機械検査する）
[ ] SCSSは案件の単位規約に従い、lint-units.mjs をエラー0にした
[ ] Sass build を実行した（PHPテンプレート変更時は php -l も実行した）
[ ] verify-layout.mjs をPC基準幅とSP 375pxの両方で全PASSにした
[ ] hover/open/active、メニュー・モーダル・アコーディオンは開閉両状態＋遷移中間値（例: 80ms時点）をCDPで確認した
[ ] 未確認項目を明記した
```

- **全件対応表（2026-07-11昇格）**：コードを編集する前に「Figmaノード一覧」「実装DOM一覧」「対応表」「未対応・余計な要素リスト」「座標/寸法/文言/画像/状態差分表」を案件側 `MyBrain/verify/` に作る。対応表には section / wrapper / inner / content / nav / list / item / title / text / button / image / 疑似要素相当 / hiddenでない装飾要素を含め、親要素の width / height / x / y / padding / gap / overflow も比較対象にする（子要素が合っていても親が違えばNG）。「FigmaにあるがDOMにない要素」「DOMにあるがFigmaにない要素」は別表で明記する。書式は `C:\AI\figma-to-code\templates\verify\figma-dom-mapping-template.md`。対応表を作れない場合は作業を進めず、未確認として止める。
- **node mapによる機械検査（2026-07-31追加）**：Markdownの対応表は人間のレビュー用で、`figma-gate` は `mappingSha256` でハッシュ固定するだけで内容を読まない。そのため対応漏れが工程を素通りしていた（親の `gap` が誰のspecにも載らず、実装差異を指摘後に初めて発見した実例がある）。これを機械で塞ぐため、同じ内容を機械可読な `MyBrain/verify/nodemap-<対象>.json` にも記述し、manifestの `scope.nodeMapPath` へ登録する。書式は `templates/verify/nodemap-example.json`。`preflight` の `assertNodeMapCoverage` が次を検査し、1件でも欠ければ **SPEC FAIL** とする。
  - `status` は `mapped` / `figma-only` / `dom-only` のいずれか。`mapped` は `selector` 必須、それ以外は `reason` 必須（未対応の黙認を防ぐ）。
  - `mapped` の各ノードは、specの要素で最低1つ測定されていること（**componentに昇格していない親wrapperや中間ノードの測定漏れを検出する**）。
  - specの全セレクタが、node mapの `mapped` または `dom-only` に追跡できること（**旧DOM前提のまま残ったspecを検出する**）。
  - component manifestの全 `figmaNodeId` がnode mapに存在すること。宣言した `rootNodeId` を含むこと。
  - PC/SP両方のviewportに登録があること（**片方の共通化だけで両方を合格扱いにすることを防ぐ**）。
- **反復要素のデータ・順序照合**：カード、検索結果、表、リストは、各viewportで可視の全itemについて `Figma node ID / Figma順 / DOM selector（nth-childを含む）/ title / label / value（`dt/dd`を含む）/ 補助文言 / 画像asset / href` を対応表またはspecのitem manifestへ記録する。照合はレンダリング済みDOMの `textContent`・属性・画像URLで行い、配列定義・テンプレートの一部・先頭itemだけを根拠にしない。PC/SPで順序または内容が異なるときは、単一DOMの原則と併せて正本を確認するまで実装を停止する。
- **テキストleafの実測必須**：カード、検索結果、表、リスト、CTAなど可視テキストを含むcomponentは、親wrapperだけのspecでは不十分とする。`h1-h6`、`p`、`dt`、`dd`、`li`、`a`、`button`など、Figmaで個別Text nodeに対応する各leafをPC/SPのspecへ個別登録し、`text`または`innerText`、width、height、line-height、`white-space`、描画行数（`lineCount`）を実DOMで照合する。文字列一致だけ、親カードの高さだけ、先頭itemだけのPASSは禁止する。いずれかのleafが未登録・未取得・不一致ならSPEC FAILまたはLAYOUT FAILとして停止し、完了報告しない。
- **可変テキスト要素の高さ変換**：card / button / label / nav item など、CMS文言・翻訳・改行・レスポンシブで文字量が変わり得る要素は、Figmaの矩形heightをCSSの固定`height`として直写しない。高さは原則として`padding`、`min-height`、`line-height`、`gap`で作り、長文時に要素が自然に伸びる構造にする。固定`height`を使えるのは、アイコンボタン、正方形サムネイル、ロゴ枠など中身の量が変わらないことをspecに根拠付きで記録できる場合に限る。この一般原則の正本は`C:\AI\web-development\rules\css-values.md`とする。

  **機械検査（2026-08-06追加）**：この項目は人間のチェックリストだけでは素通りする（実際、`lint-units.mjs` は `height` を見ず、ゲートも実測高さしか照合しないため、paddingを焼き付けた`height`はFigmaのダミー文言のままなら PASS していた）。`preflight` の `assertVariableTextHeight` が次を検査し、違反を **SPEC FAIL** とする。
  - `text` / `innerText` / `textPattern` / `lineCount` のいずれかを持つ要素が `height` を単一の数値で宣言し、その値が `lineHeight × lineCount`（許容誤差 `tolerance`）で説明できない場合は不合格。高さが行ボックスそのものなら固定枠ではないので合格とする。
  - 可変テキスト要素のspecは `"height": [min, max]` の範囲指定で書く。
  - 幅が `tolerance` 以下のレンジ（例 `[64, 64]`）は単一値と同じに扱う。レンジ形式にするだけで検査を外せる抜け道は塞いである。
  - 例外は `note` に `fixed-height-reason: <根拠>` を書いた場合に限る（中身の量が変わらない要素のほか、`-webkit-line-clamp` や `overflow: hidden` で意図的に高さを固定する設計もここで通す）。根拠が空なら不合格。**記録先が `note` に限られるのは仕様**で、`fixedHeightReason` のような独自キーは `assertSpecProvenance` が provenance の無い測定値として別途SPEC FAILにする。
  - 既存案件の未移行specは `node MyBrain/verify/gate-contract-audit.mjs` が `可変テキスト要素の固定height xN` として一覧する。preflightで落ちるのを待たずに件数を把握し、`legacy-scopes.json` で明示宣言するか移行する。
- **可視行数を照合する**：`lineCount` は `Range.getClientRects()` の総行数ではなく、対象要素の表示領域内に実際に描画される行数とする。`overflow: hidden`、固定height、line clampがある場合、隠れた行を数えてPASS/FAILを誤判定してはならない。
- **省略表示も照合する**：Figma Text nodeに`text-ellipsis`、固定height＋clip、line clampのいずれかがある場合、可視行数だけでPASSしてはならない。specへ`overflow`、`textOverflow`、`webkitLineClamp`（必要時`display`）を登録し、末尾が3点リーダーになるか、またはFigmaが指定するclip表示かをFigma nodeと実DOMの両方で確認する。省略仕様が未登録・未取得・不一致ならLAYOUT FAILとして停止する。
- 実測は案件側 `MyBrain/rules/units.md`（単位規約）で定めた基準幅で行う。基準幅ちょうどで測るとFigma px値と直接比較できる。基準幅以外で測った値は必ず換算してから判定する。単位規約が無い案件は、既存CSSの `html { font-size }` から規約を特定して units.md を書いてから実装する。
- オーナーは、着手宣言の無い作業・チェックリスト未完了の完了報告を差し戻してよい。

## フェーズ1: 取得（spec作成）— 取得漏れを塞ぐ

- 実装前に、対象ページ/セクションの検証スペックをファイルに固定する。チャット内の記憶を根拠にしない。
  - 置き場所：案件側 `MyBrain/verify/spec-<対象>.json`
- specに載せる項目（要素ごと）：セレクター、Figma node id、left / top（セクション基準）/ width / height、font-size、line-height、letter-spacing、color、背景色、文言・改行。
- 背景色は `figma-mcp-implementation.md` の「背景色の確定手順」に従い、根拠（design_context出力 / variable_defs / 個別スクショのピクセル実測）が無い値をspecに書かない。
- design_contextに出てこない値は「未取得」として止める。**specの欄が埋まらない要素があるまま実装に進まない。**
- Figmaのノードツリー（get_metadata）とspecを突き合わせ、specに載っていないセクション・要素がないか確認する（セクションまるごと見落としの検出）。
- **TEXTノードは文言を必ず検証する。** node map が `figmaNodeType: "TEXT"` と宣言した対応先に `text` も `textPattern` も無いspecはゲートが落とす。幾何値だけ合わせて文言が違う実装が「verified」として出荷されるのを防ぐため。
- **動的文言は書式で検証する（`textPattern`）。** 件数・日付・ページ番号のように実データで変わる文言は、Figmaのtextノード名をそのまま期待値にしない。textノード名はデザイン時点のダミーで、実装の正解ではないことがある（実例：services一覧のPCは「該当 18 件 / 全 18 件」だがカード実体は21件、SPでは同じノードが hidden になり `txt` に置き換わっていた）。この場合は `textPattern`（正規表現）と `textPatternReason`（20文字以上、なぜ動的かとFigma証跡が何を示すか）を書く。`text` との併記は認めない（固定なのか動的なのかが曖昧になるため）。
- 動的かどうか迷ったら、**もう一方のviewportの同じノードを見る。**片方で literal、もう片方で汎用名や hidden になっていれば動的値である。
- **インスタンス内部の文言とIDを `get_metadata` から採らない（2026-08-04昇格）。** `get_metadata` をINSTANCEに対して呼ぶと、子は「インスタンス相対ID（`0:3` 等）」と「コンポーネントの既定テキスト」で返る。オーバーライド後の実文言ではない。実例：service詳細 H3-01（PC 2034:26820）の見出しは metadata では「機能コンテンツA」だが、実際は**「機能コンテンツC」**。同様に services一覧の H2-02 は8箇所すべてが metadata では "BPMS" と返る（幅が 36 と 53 で違うのに同名＝既定値である証拠）。
  - インスタンス内部の正本は `get_design_context` の出力。ID は `data-node-id="I<instance>;<componentChild>"` の形で出るので、node map の `figmaNodeId` にはこれを使う。
  - 直接の TEXT ノード（インスタンスの外）は `get_metadata` のノード名が実文言なので、そのまま使ってよい。
  - **見分け方：同じコンポーネントの別インスタンスを2つ metadata で取り、テキストノード名が同一で幅が違えば既定値を見ている。**

## フェーズ2: 換算・実装 — 転記ミスを塞ぐ

- 単位換算は案件側の単位規約（`MyBrain/rules/units.md`）に機械的に従う。
  - px→rem（同数値）、letter-spacing px→em（px÷font-size）、line-height→単位なし（%÷100、**pxの場合も px÷font-size で単位なし**）。
- **規約に無い第3の書き方を発明しない。** 「Figmaが特殊な指定だから」は規約逸脱の理由にならない。規約の換算表に当てはまらないケースが出たら、独自判断せず未確認として止めるかオーナーに確認する（実例：Figmaのpx固定leadingをremで書いた逸脱 → 正しくは px÷font-size の単位なし。2026-07-06）。
- 実装・修正したSCSSは、ビルド前に必ず単位規約lintを通す：
  - `node MyBrain/verify/lint-units.mjs <対象scss>`（無い案件は共通Vault `C:\AI\figma-to-code\templates\verify\lint-units.mjs` を案件側 `MyBrain/verify/` へコピー。導入手順は `C:\AI\figma-to-code\templates\verify\README.md`）
  - 検査内容：line-heightの単位付き指定 / letter-spacingのpx・rem / レイアウト系プロパティのpx直書き（border系・@media・理由コメント付き行は許容）/ margin-bottom・margin-rightの理由なし使用 / @mediaブロック内での `&__`・`&--` セレクター再宣言（E4）
  - **エラーが0になるまでビルド・完了報告に進まない。** 例外を使う場合は同じ行に理由コメントを付ける（lintはコメント付き行を許容する）。
  - **単一対象の既存UI修正では、編集前に同じ対象SCSSのlint基準線を保存する。** 基準線に既に存在する対象外セレクタ・行のエラーは、そのラウンドの修正対象にしない。編集後は「基準線にない新規エラー 0」を必須とし、基準線エラーは path / line / source hash をevidenceへ記録して別scopeへ切り出す。既存エラーを理由に対象外ファイル・セレクタの修正、追加の検証、完了判定の拡張をしてはならない。
- 換算結果はspecまたはSCSSコメントに元値を残す（例：`letter-spacing: 0.05em; // Figma 2.2px / 44px`）。
- 座標の基準を明記する。特に absolute 配置は「何を基準（positioning context）にした値か」をコメントに書く。
  - 実例：セクション padding-top の内側にある inner を基準にする場合、Figmaのセクション基準y値から padding-top を引く（2026-07-05 CTA +80pxズレの教訓）。

## フェーズ3: 実測照合 — 検証漏れを塞ぐ

- 実装後、CDP（headless Chrome + DevTools Protocol）で実ブラウザ実測を行い、specと自動照合する。
  - スクリプト：案件側 `MyBrain/verify/verify-layout.mjs`（無い案件は共通Vault `C:\AI\figma-to-code\templates\verify\verify-layout.mjs` をコピー。specの書式見本は `C:\AI\figma-to-code\templates\verify\spec-example.json`）
  - 実行例：`node MyBrain/verify/verify-layout.mjs MyBrain/verify/spec-top.json [URL上書き]`
- 照合対象URLは、コンポーネント見本ページではなく**その部品が実際に使われるページ**のURLをspecに書く。公開・デプロイ後は公開URLを第2引数に渡して同じspecを再実行し、**デザインと公開ページの一致**まで確認してから公開完了と報告する。
- 照合内容：
  - 要素ごとの bounding box（left / topInSection / width / height、許容誤差 ±1.5px）
  - computed style（font-size / line-height / letter-spacing / color / background-color / border-radius / padding / margin / gap 等の完全一致）
  - textContent / innerText、明示改行、描画行数（lineCount）の一致
  - ページ全体：html font-size（rem基準確認）、body scrollWidth（横はみ出し検出）
  - PC基準幅（1440等）とSP基準幅（375）の両方で実行する
- **手作業のスクリーンショット目視は、崩れの発見補助であり、合否判定には使わない。**
  - ただし、背景・画像のクロップ・アイコン・描画装飾は、Figma参照画像とブラウザ撮影を同一範囲・同一倍率へ正規化した**自動画像差分**で照合する。文字アンチエイリアスやFigma canvas/Chromeの再サンプリング差は、検証ツールが対応するmask、または文字を除いたpaint-onlyのDOM領域で切り分ける。maskを未対応のツールで擬似的に運用してはならない。対象領域・閾値・採用理由はspecまたはevidenceに記録し、理由を特定できない差分はPASSにせずFAILまたは未確認とする。
  - 撮影モードは、CDP実測と同じDOM状態を再現できる案件側の検証済みモードに固定する。`headless=new` 等で描画アーティファクトが出た場合だけ再現済みモードへ切り替え、使用モードとbaseline更新根拠をevidenceに残す。

## フェーズ3A: 一括照合・修正バッチ（単一実行、2026-07-18追加）

> 目的：対象checkpointの範囲で、PC/SPの全要素を**同じspec・同じ検証コマンド**で照合し、FAILをまとめて修正する。部分的な目視確認、要素ごとの手作業再実行、推測による微調整を反復しない。
>
> ここでいう「一回完結」は、対象スコープの1反復を1本の再現可能なコマンドで完結させることを指す。FAILが出た場合は、同じ対象スコープのFAILを1つの修正バッチへ集約し、修正後に同じ全件コマンドを1回実行する。PASS済み要素をspecから外したり、PC/SP・状態を分割したりして合格扱いにしてはならない。

### 3A-0. 検証ツールの適格性

- `preflight` の前に、採用する検証ツールが次を満たすことを確認する：PC/SPを1本の検証コマンドで実行できること、各viewportの準備を固定秒数ではなくDOM・フォント・画像・状態の条件で待機できること、画像差分の対象領域・閾値をmanifestで再現できること、測定値と差分結果を保存できること。
- 実装テンプレートがこの要件を満たさない場合は、ソースを編集せず検証ツールを先に改善する。PC/SPや要素を手作業で分割して確認したり、目視の許容で代替したりしてはならない。
- 本フェーズの「同一ブラウザプロセス」は、対象checkpointのPC/SP測定でブラウザ状態・フォント・撮影条件を共有することを意味する。ツールが別プロセスへ分割する場合は、分割理由と同一条件の再現性をevidenceに残し、性能・再現性の問題を解消するまで標準手順として採用しない。

### 3A-1. 編集前: 集約specを確定する

- checkpoint対象のsection / componentに属する**可視要素を全件**、PC/SPの同じspecに登録する。親wrapper・inner・背景・疑似要素相当の装飾・画像の表示領域・状態差分も含める。文言、明示改行、期待行数、line-height、角丸、gapもspec対象に含める。
- **矩形に現れない性質もspecへ書く（2026-08-03追加）。**`text-align`、`font-weight`、装飾は `getBoundingClientRect` に出ない。期待値を書かない限り、実測が全件PASSしても誤りが残る（実測：SP本文がPCの中央寄せを継承したまま32項目PASSし、画像差分だけが検出した）。同一要素でもPC/SPそれぞれの `get_design_context` を取り、指定の有無を比べる。`verify-layout.mjs` は `textAlign` / `fontWeight` を測定する。
- **line-heightはトークンの%をそのまま採らない（2026-08-03追加）。**Figmaのテキストエンジンは行送りを整数pxへ丸めるため、16px/160%は25.6pxではなく26pxで描かれる。`Text nodeの高さ ÷ 行数` で検算し、provenanceは `metadata` にする。1行あたりの差0.4pxは許容差に埋もれるので、同じトークンを使う要素のうち**最も行数の多いもの**で検算する。
- 要素ごとに、Figma node ID、実装DOMセレクタ、PC/SPの幾何値、文字値、computed style、画像asset URL / 実フォーマット / SHA-256、画像差分対象領域、状態（default / hover / open等）を対応付ける。Figmaの対応nodeまたは値が未取得なら、コードを編集せずSPEC FAILとして停止する。
- **取得元（provenance）の必須化（2026-07-30追加）**: specの期待値は1つずつ取得元を持たせる。要素ごとに `provenance` を置き、測定キー（`sel` / `note` / `provenance` 以外の全キー）に対して `metadata` / `design_context` / `variable_defs` / `screenshot` / `asset` / `rest` / `scale-conversion` / `owner-decision` のいずれかを指定する。`owner-decision` はFigmaに表現されないリンク先など、記録済みのオーナー決定でしか確定できない値に限定し、対応表またはcorrection IDを併記する。取得元のない期待値、未知の取得元（`inferred` などの推測を表す値を含む）、実在しない期待値に対する取得元は、`figma-gate preflight` が **SPEC FAIL** として拒否する。取得できていない値は推測で補わず、追加取得してから記載する。取得できない場合は未確認として停止する。書式は `templates/verify/spec-example.json`、検査は `templates/verify/figma-gate.mjs` の `assertSpecProvenance`、回帰試験は `templates/verify/figma-gate.e2e.mjs` の負のE2E3件（取得元なし／未知の取得元／実在しない期待値への取得元）。
- Figmaノード一覧、実装DOM一覧、対応表、未対応・余計な要素リストを突き合わせ、対象スコープに「specに無い可視要素」がないことを確認する。コンポーネント利用可否はcomponent manifestと実使用ページのDOM構造で確定する。
- `preflight` は上記入力とpage coverageのハッシュを固定する。Figma情報・画像asset・DOM対応を編集後に見つけた場合は、推測で補正せず集約specへ戻って更新する。

### 3A-2. 編集後: 1本の全件検証コマンドを実行する

- PC基準幅・SP基準幅・必要な状態を、**同一ブラウザプロセス・同一検証コマンド**で測定する。待機は固定秒数ではなく、フォント・画像・対象セレクタ・開閉状態の出現を条件にする。
- 1回の実行で、全要素のCDP矩形、computed style、overflow、状態、asset情報、ブラウザ撮影、Figma参照画像との差分を収集し、単一の終了結果と保存済みevidenceから再現できるPASS / FAILレポートを出す。
- 結果は少なくとも次の3種類に分類する。
  - `SPEC FAIL`: Figma値・asset・対応node・DOM対応が未取得、矛盾、または証跡不足。
  - `LAYOUT FAIL`: CDP矩形、computed style、overflow、状態がspecと不一致。
  - `VISUAL FAIL`: 自動画像差分で、mask・閾値の根拠では説明できない背景、クロップ、アイコン、装飾の不一致。
- spec不備、待機失敗、タイムアウトを理由に、viewport・要素・確認項目を手作業で分割して実行してはならない。specまたは検証ツールを修正し、同じ全件コマンドを最初から実行する。

### 3A-3. FAILを一括修正し、同じ全件検証を再実行する

- `SPEC FAIL` は実装を変更せず、Figma取得・asset確認・DOM対応表を補完してから再実行する。
- `LAYOUT FAIL` と `VISUAL FAIL` は、対象checkpoint内のFAILをすべて1つの修正バッチに集約する。1要素だけ修正してスクリーンショットを見直す往復を禁止する。
- 修正後は、3A-2と同じPC/SP・同じ状態・同じ対象全件のコマンドを1回実行する。前回PASSだった要素も必ず再測定し、修正による回帰を検出する。
- どれか1件でもFAIL、未分類差分、未確認証跡が残る限り、checkpoint / section-close / 完了報告へ進まない。

### 3A-4. 証跡と完了判定

- 実行ごとに、spec入力ハッシュ、Figma node / asset取得時刻、browser URL、viewport、待機条件、CDP測定値、画像差分のmask・閾値・結果、PASS / FAIL一覧を案件側 `MyBrain/verify/` に保存する。
- 手作業の目視所見は補助情報に留め、CDP実測・自動画像差分・保存済み証跡と矛盾する場合に合格へ上書きしない。
- 対象checkpointの全件が `SPEC FAIL 0 / LAYOUT FAIL 0 / VISUAL FAIL 0` となり、既存のbuild・lint・必要なPHP lint条件も満たした場合だけ、次のcomponentまたはsection-closeへ進める。

## フェーズ3B: 対象スコープの実行順固定（2026-07-18追加）

> 目的：1つの修正依頼を、取得・修正・PC/SP実測・必要時のHTML検証まで最短の再現可能な1ラウンドで閉じる。検証の名目で無関係なリファクタ・全ページ修正・手作業の再撮影を増やさない。

### 1-0. 構造一致ゲート（2026-07-19追加）

- 編集前に、対象Figma nodeのAuto Layoutグループと現行HTMLの親子構造をDOM対応表へ記録する。Figmaで独立したグループ（例: 見出し+リード、リスト、ボタン枠）がHTML上で同じグループになっていない場合は、CSSの編集を開始しない。
- 構造不一致は、先にHTMLをFigmaのグループ構造へ修正して解消する。親の一律`gap`、子の負`margin`、要素別の打消し指定で視覚だけを合わせることを禁止する。
- レイアウト目的の負`margin`は原則禁止する。Figmaに明示された重なり・はみ出しだけは例外とし、対象node ID、PC/SP条件、必要性をSCSSコメントとspecへ記録する。
- `gap`は同じレイアウト責務を持つ兄弟要素にだけ使う。異なる間隔が必要な要素は、Figmaのグループ単位でHTMLを分け、それぞれの親へ`gap`または余白を設定する。
- コンポーネントrootは外側のセクション間余白を`padding`として持たない。component manifestの`spacingOwnership.rootPadding`は`none`または`internal`のみ、`spacingOwnership.interSectionSpacing`は`parent-layout`または`not-applicable`のみを許可する。Figma上で隣接セクションとの距離に見える余白は、親sectionまたはlayout wrapper側に記録・実装する。
### 1ラウンドの固定順序

1. **Figma値を取得してspecを確定する**
   - 対象component / sectionのPC・SP node、寸法、余白、文字、色、asset、DOM対応、既存コンポーネントのreuse判定を取得する。
   - 未取得値、未決のcomponent判断、asset根拠不足が1件でもある間は編集しない。
2. **確定した対象スコープだけを修正する**
   - 依頼対象外のリファクタ、他sectionの見た目修正、既存W3Cエラー修正を同じラウンドへ混ぜない。
   - 共有コンポーネント化が必要な場合は、preflightのcomponent manifestに明記し、対象スコープとして先に確定する。実装途中に発見した場合は、スコープを拡張するか別依頼に分ける。推測で横展開しない。
3. **PC/SPを各1回、同一checkpointコマンドで、固定済みFigma参照と比較して全件照合する**
   - 同一ブラウザプロセスで、specに固定したPC基準幅とSP 375pxを各1回測定する。対象specに登録された全要素・全状態について、CDP矩形、specに列挙したcomputed style・overflow、文言・明示改行・期待行数、asset URL・実フォーマット・SHA-256、ブラウザ撮影、Figma参照画像との差分を、同一実行のevidenceとして保存する。
   - 各照合は、preflightで固定したFigma node ID、spec値、Figma参照画像、画像差分のcrop・mask・閾値を基準とする。ブラウザ内の測定値同士の一致だけではPASSにしない。Figma node、spec値、asset、参照画像のいずれかが未取得・不整合ならSPEC FAILとする。
   - 3A-2の分類を適用する。矩形・computed style・overflow・状態の不一致はLAYOUT FAIL、mask・閾値で説明できないpainted領域の差分はVISUAL FAILとする。SPEC FAIL、LAYOUT FAIL、VISUAL FAIL、未分類差分のいずれかが1件でもあればcheckpointはFAILとする。
   - 手作業の要素単位撮影、スクロールバー差だけを理由にした再撮影、PASS済み要素を除外した再計測をしない。測定環境が不適格なら、実装ではなく検証ツールを先に直す。
   - **画像差分の比率は良否の判定に使わない（2026-08-03追加）。**グリフのラスタライズはピクセル格子との位相で決まるため、レイアウトをFigma実値へ近づけると比率がむしろ増えることがある（実測：縦ずれ0.8px時0.02872 → 0.4pxへ縮めて0.03198）。判定はCDP実測層（height・lineHeight・textAlign・topInSection）で行い、画像差分は**specの測定項目に無い誤りを見つける検出器**として扱う。
   - **閾値の緩和には実測した下限の記述を要する（2026-08-03追加）。**閾値はビューポート別に持てる（`visualThresholds`）。既定の厳格値1%を超える値は `visualThresholdBasis` に下限と取得方法を書かなければ `preflight` がFAILする。下限は単発の測定値ではなく**観測した位相のうち最大値**を採り、閾値は下限と「実際に検出できた最小の誤り」の中間に置く。
   - **閾値超過の原因は面積ではなく差分画素の座標分布で特定する（2026-08-03追加）。**差分画像の差分画素を行・列へ集計してから対処する。maskを当てた場合は `diffPixels` が実際に減ったことを確認する。減っていなければ前提が誤りで、maskは分母だけを縮めて比率を悪化させる。
4. **HTML/PHPを変更した場合だけ、対象URLのW3Cを1回実行する**
   - W3Cの正本は `C:\AI\web-development\rules\w3c-validation.md`。CSS・画像だけの変更では、W3Cを新たに実行しない。
   - 変更したテンプレート起因の `Error` はゼロにする。対象外の既存 `Error` を見つけても、推測で修正範囲を広げない。原因・行・影響を記録し、ページ全体のW3C PASSとは報告しない。

### 単一対象修正の実行フェンス（2026-07-30追加）

適用条件は、オーナーがFigma nodeと単一component / selectorを指定し、事前宣言した変更パスがSCSS/CSSだけで、HTML / PHP / JS / assetを変更しない修正である。

1. 編集前に対象SCSSのlint基準線、scope manifest、Figma spec、DOM対応を固定する。
2. `scope-lock assert` 後、manifestにあるSCSSだけを編集し、案件の既存Sass buildで対応CSSを生成する。生成物の形式を変える別build、整形、他ファイルの修正を混ぜない。
3. 固定済みの同一checkpointでPC/SPを1回ずつ照合する。HTMLを変更しないためW3Cは実行しない。
4. このラウンドで許可される追加作業は、checkpointが示した**同一scope内のFAILを1つに集約した修正**と、同じcheckpointの再実行だけである。

次を禁止する：既存lint・既存W3C・別section・共有ルール・検証基盤・生成CSS形式を起点にした作業拡張、追加の目視撮影、別コマンドへの切替、scope外の「ついで」修正。対象外の既存失敗を見つけた場合はpath / line / hashだけをblockerとして記録し、その場で修正・再検証・調査を続けない。scope外作業が必要になった時点で当該ラウンドを停止し、オーナー承認を得た別scopeとして開始する。

### FAIL時の反復

- 3または4でFAILしたら、対象スコープ内のFAILをすべて1つの修正バッチに集約する。
- 修正後は同じcheckpointをPC/SP各1回、同じ条件で再実行する。FAILがない場合にだけラウンドを閉じる。
- この順序を飛ばして「確認済み」「完了」と報告しない。
- 経路ラベル（R1〜R4）の付与条件・判定順序、および同一FAILキー（viewport／セレクタ／測定項目）が3ラウンド連続でPASSしない場合の「未収束の宣言」は、`spec/10-fix-order.md` §1-2 を正本とする（2026-07-30追加）。
## フェーズ3C: close後の自己改善（2026-07-18追加）

- `figma-gate close` の成功後、案件側 `MyBrain/verify/loop-learn.mjs` が学習イベント、検知レポート、必要時の案件ローカル安全制御を生成する。これはコーディング反復の終了処理であり、Git hook、commit、push、deployでは実行しない。
- 学習イベントは所要時間、componentごとのPC/SP実測回数、宣言外変更の観測可否、HTML/PHP変更時のW3C記録状態を事実として保存する。値が取れないものを推測で補完しない。
- カタログに明示された `safe-auto` は、既存要求を削らない案件ローカル制約だけを `MyBrain/verify/learning/active-controls.json` に追加する。次のpreflightはその制約と検証器能力の互換性を確認する。
- 正本ルールや検証器の設計変更が必要な場合は、`pending-review` の提案を保存して止める。独立レビューとオーナー承認なしに `C:\AI\figma-to-code\rules\` を書き換えない。
- 詳細な入力、出力、停止条件は `C:\AI\figma-to-code\rules\self-improvement.md` を正本とする。
## Web完了ゲートへの受領証連携

Figma scopeで `coding:gate` を併用する場合、coding manifest の `scope.figmaGate.manifestPath` は同一scopeのFigma manifestを指し、両方の `changeTargets` は完全一致させる。`figma:gate close` 成功後にだけ `coding:gate close` を実行する。後者は `.figma-gate/active.json` のclose受領証（`phase: "closed"`）、manifest hash、対象ファイルhashを検査するため、証跡文字列や手作業の報告だけでFigma照合済みとは扱わない。

## 完了条件（報告ルール）

- 「完了」「Figmaどおり」と報告してよいのは、次のすべてを満たす場合だけ。
  - **lint-units.mjs がエラー0**、Sass build、および必要なPHP lintが成功している。
  - **verify-layout.mjs がPC/SPの全項目PASS** である。
  - **`figma-gate close` が成功終了**し、全target componentを最終状態で再測定・再差分している。保存済みevidence上で `SPEC FAIL 0 / LAYOUT FAIL 0 / VISUAL FAIL 0` を確認できる。
- 完了報告には必ず①specファイルのパス ②lint-units実行結果 ③verify-layout全PASSログ の3点を添付する（corrections.md 2026-07-07）。フェーズ0のチェックリストに未完了項目がある報告は「完了」と書かない。
- FAILがある状態で完了報告しない。直せない場合はFAIL内容を差分として報告する。
- 機械照合できない項目（実機Safari、ホバー挙動、CMS可変文言の行数、Figmaデータ自体の矛盾）は「未確認リスト」として必ず明示する。
- Figmaデータ側の矛盾（例：コンポーネント固定高さと中身合計の不一致）を検出したら、どちらに合わせたかを根拠つきで記録する。

## 停止・未確認として報告する条件（2026-07-11昇格）

以下のどれかがある場合は、実装を進めない、または完了として報告しない。

- URLにnode-idがない、またはFigma MCPから対象nodeを取得できない。
- 色・画像・文言・状態差分・PC/SP対応nodeの値が未取得（specに未取得欄が残る）。
- spec、全件対応表、実使用ページのDOM照合が未作成。
- Figma値と実測値の不一致（FAIL）が残る。
- CDP・ローカルページ・公開ページが利用できず実測できない。この場合は静的比較までに留め、実測未確認のまま実装完了にしない。

報告の表現は「<範囲>は未確認」「<項目>の取得待ち」「specの<項目>がFAIL」とする。「見た目は大体合っている」「主要要素は合っている」をFigma確認の根拠にしない。

## 報告テンプレート（完了・途中報告共通）

```text
対象: <ページ・コンポーネント>
Figma: fileKey=<...> / nodeId=<...>
spec: MyBrain/verify/spec-<対象>.json

実装した差分:
- <Figma node> の <事実> に対し、<ファイル・セレクター> を変更。

検証:
- lint-units: エラー0
- Sass / php -l: 成功
- verify-layout: PC <PASS数> / SP <PASS数>、FAIL 0
- 状態差分: <default/hover/open等> をCDPで確認

未確認:
- <実機Safari、公開URL未反映など。なければ「なし」>
```

## 限界（正直に扱う）

- このパイプラインが保証するのは「specに載せた項目の一致」だけ。specの品質＝保証の範囲。
- 実機レンダリング（Safari/iOS）、デザイン意図の解釈は機械照合の対象外。未確認として残す。

## ページ全体カバレッジとセクション完走（V4、2026-07-15追加）

L1ではPC/SPページ全体のFigmaメタデータを別ファイルへ保存し、page coverageに全セクションを登録する。対象外を暗黙に扱わない。

### page-inventory と scope-coverage の分離（2026-08-02追加）

page coverageは2層に分ける。単一セクションのscopeでも「ページ全体を登録する」要件を満たせるようにするための契約である。

- **`inventory`（ページ単位の不変証跡）**：ページroot配下の全セクションを `sectionId` と `figmaNodeIds.pc` / `figmaNodeIds.sp` の対で列挙する。`source`（取得手段。例: `Figma MCP get_metadata`）も必須。scopeが変わっても同じページなら同じ内容になる。
- **`sections`（scope単位の実行契約）**：`inventory` の各セクションを `target` / `context` / `deferred` / `completed` のいずれかに分類する。
  - `target`：本scopeで実装・検証する。component必須。
  - `context`：`shared-header` / `shared-footer` のみ。component不可。
  - `deferred`：本scopeでは着手しない。component不可だが、**`figmaNodeIds.pc` / `.sp`、`reason`、`followUpScope` を必須**とする。
  - `completed`（2026-08-03追加）：**先行scopeで検証済み**。component不可。`figmaNodeIds.pc` / `.sp`、`completedByScope`、`closeReportPath` を必須とする。`deferred` と違い後続scopeを持たない。2件目以降のscopeでこの役割が無いと、完了済みを `deferred` と書くしかなくなり、`followUpScope` に既に走ったscopeを指す偽の記録が残る。

`preflight` は双方向に検査する。`inventory` にあって `sections` で分類されていないセクションがあれば**分類漏れ**としてFAIL、`sections` にあって `inventory` に無ければ**inventoryに存在しない**としてFAILする。これにより、対象外セクションを検証器が読まない自由記述フィールドへ逃がす回避策は成立しない。

**並び順もページ構造の一部として検査する（2026-08-03追加）。** `sections` は `inventory` と同じ並びであることを必須にする。`inventory` の並びは Figma ページ証跡（`pages.{pc,sp}.metadataPath`）のセクション順に揃える。順序が実際のページと違うと、レビュアーは「どこが抜けているか」を目視で追えず、証跡としての意味が落ちる。

**coverage は自分がどのscopeのものかを宣言する（2026-08-03追加）。** `scopeId` を必須とし、gate manifest の `id` と一致しなければFAILする。先行scopeのcoverageを丸ごと複製すると、`deferred` の `reason` など**そのscope固有の記述が前のscopeのまま残る**。人が読めば分かるが、`reason` は非空文字列でありさえすれば通るため検証器は素通りする（実測：25件すべてが前scopeの記述のまま独立レビューに回り、レビュアーの指摘で発覚した）。`scopeId` の不一致で落とすことで、複製したまま提出することを不可能にする。

同一ページ・同一targetを扱う後続scopeが**変更せず**同じcoverageを使うのは正当な再利用なので、`sharedWithScopes` に共有先の `id` を列挙すれば通る。無宣言の共有は複製と区別がつかないため認めない。

`completed` は宣言だけでは通らない。`closeReportPath` が**実在し**、そのclose-reportが当該 `sectionId` を `coverage.targetSectionIds` に含み、`result` の SPEC / LAYOUT / VISUAL がすべて0であることまで検査する。先行scopeの合格証跡が無ければ「完了済み」と書けない。`completed` は今回のscopeの `targetSectionCount` には含めず、`completedSectionIds` として別に報告する。

検査は `templates/verify/figma-page-coverage.mjs` の `manifestContext`、回帰試験は `templates/verify/figma-gate.e2e.mjs` の負のE2E14件（deferredの必須項目4件＋正しい宣言のPASS、inventoryの分類漏れ・未登録・PC/SP対欠落・inventory自体の欠落、completedの必須項目・close-report不在・target未列挙・FAIL残存・component混入の5件＋正しい宣言のPASS）。

この契約は独立レビュー（codex, 2026-08-02）の指摘から採用した。経緯は `rules/corrections.md` 2026-08-02。

### scopeの粒度（2026-08-04追加）

**1スコープに複数の `target` セクションを入れられる。**`section-start` → `checkpoint` → `section-close` を宣言順に繰り返し、`close` が全targetの `verified` を要求する。検証器側の対応は不要（実測で3セクションの遷移が正常に回ることを確認済み）。

粒度の選択はレビュー回数に直結する。`scopeId` が manifest `id` と一致必須なので、**scopeを1つ作るごとに page coverage の独立レビューが1往復必要**になる。1セクション1スコープにすると、23セクションのページではレビューが23往復になる。

したがって粒度は「1セクション」ではなく、**独立レビューが一度に妥当性を判断できる範囲**で決める。目安はページの領域単位（上部・中部・料金・下部・関連など）で4〜6セクション。1スコープが大きすぎると、checkpointのFAILがどのセクション由来か切り分けにくくなり、レビュアーの負担も上がる。

> 実例：service詳細ページで1セクション1スコープを3回繰り返したところ、3件目には検証器の穴は出なくなり、見つかるのはページ側の実装差分だけになった。**検証手段として実スコープを回すのは、新しい穴が出なくなった時点で打ち切る。**そこから先は案件の実装作業であって、検証器の改善ではない。

### 旧契約scopeの棚卸し（2026-08-03追加）

契約を強化するたび、既存のgate manifestは自動的に旧契約になる。旧契約のscopeは `preflight` で落ちるが、落ちること自体を誰も見ていないため、**過去の完了報告が現在の基準を満たしていない事実が黙って残る**。

`templates/verify/gate-contract-audit.mjs` を案件へコピーし、`npm run figma:audit` で全 `gate-*.json` を走査する。現行契約に欠ける項目を一覧し、未移行は `MyBrain/verify/legacy-scopes.json` の `acknowledged`（`manifest`・`reason` 20文字以上・`plannedMigration`）で明示宣言する。宣言のない旧契約manifestも、移行済みなのに残っている宣言も、どちらも失敗にする。免除ではなく台帳であり、移行が済んだ行は削除する。

**旧契約でcloseしたscopeを「Figmaどおり検証済み」として扱わない。**当時の基準では合格していても、現在の基準では未検証にあたる。再報告するなら現行契約で通し直す。

- `role` は `target` / `context` / `deferred` / `completed`（上の分離節を正とする）。`target` は `next` / `current` / `verified` の状態を持つ。`context` は、当該scopeで共有部品本体・共有部品の選択条件・その条件が参照するルート/ページ種別判定を変更せず、対象URLの実DOMが同一であることを確認済みの共有ヘッダー・共有フッターだけに使う。いずれかを追加・変更するscopeでは、共有部品を `target` とし、PC/SPのルート要素・ブランド表示・操作要素をspecへ登録してcheckpoint対象にする。
- ページトップの共有ヘッダー・フッターも、対象範囲なら `target` として登録する。
- component manifestの各 `elementId` は1つのtargetセクションだけに属し、`component.sectionId` と一致させる。
- L2開始前に、独立レビューでpage coverage・対応表・Figma PC/SPメタデータ・セクション順序を確認し、現在のcoverageハッシュに対する `approved` を記録する。承認またはハッシュ一致がなければ `preflight` とソース編集を開始しない。
- L2は `section-start` → 対象componentの `checkpoint` → `section-close` の順で進める。checkpointがFAILならQ-10の診断→最小修正→同一componentの再実行をPASSまで行う。`section-close` は当該セクションの証跡整合性と完了だけを記録し、最終closeが全componentを最終状態で再照合する。
- 最終 `close` は全targetセクションが `verified` の場合だけ許可する。`next` または `current` が残る状態で、ページ全体を完成・Figmaどおりとして報告しない。

- 2026-07-18 / codex / D-012として、編集範囲を実行時に固定し逸脱時にblockedへ遷移するscope lockを追加

## オーナー訂正受領証ゲート（2026-07-19追加）

Figma実装中にオーナーから「デザインと異なる」「確認していない」「コンポーネントを使っていない」などの訂正を受けた場合、以降の修正は必ず `scope.kind: "correction"` とする。訂正対象を「新規実装」として再開してはならない。

1. 案件側 `MyBrain/rules/corrections.md` に、先頭行へ一意な `<!-- correction-id: CR-... -->` を付けた訂正記録を追加する。案件固有の事実をここに残す。
2. 編集前に案件側のコピー済みツールで受領証を作る。

```powershell
node MyBrain/verify/correction-receipt.mjs record MyBrain/verify/corrections/<CR-id>.json MyBrain/rules/corrections.md <CR-id> <project-only|cross-project>
```

3. gate manifest の `scope` に次を記録し、`preflight` を再実行する。

```json
{
  "kind": "correction",
  "correctionReceiptPath": "MyBrain/verify/corrections/<CR-id>.json"
}
```

`preflight` は受領証、訂正ID、案件ログSHA-256を検査する。ログが未記録・IDがない・受領証作成後にログが変わった場合は失敗し、編集、checkpoint、close、完了報告へ進めない。案件横断の失敗は、この受領証とは別に `rules/correction-log-promotion.md` の `figma-log-promote.mjs record` で記録する。
- 2026-07-29 / codex / L2改善として、verify-layoutの測定項目拡張とcomponent rootの外側セクション間padding禁止を実行ゲートへ接続。
- 2026-08-06 / codex / 可変テキスト要素の固定height禁止をWeb正本参照のFigma変換ルールとして追加。
