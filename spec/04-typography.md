# 04. タイポグラフィの差異吸収（Q-04）

- 設問: フォント・タイポグラフィの差異をどう吸収するか？
- 状態: 合格（kazu の確定承認待ち。批評記録は STATE.md [12][32][40][42]）

## 方針

Figma が描画に使っている**実フォント・実ウェイトをブラウザにも読み込ませる**ことを原則とし、値はすべて出典タグ付き実値（Q-01 §3）を転記する。ブラウザによる合成スタイル（faux bold / faux italic）と、推測による代替フォント選定を禁止する。

根拠の凡例は Q-01 と同じ:【公式】【実測:MyBrain】【実測:スキーマ】【仮説】

## 1. フォント読込方法

### 1-1. 使用フォントの特定

- `get_design_context` から対象範囲で使われている font-family / font-weight / font-style の実値一覧を作る。**使用ウェイトを網羅**する（1ウェイトでも欠けると合成太字が発生する）。
- 一覧の各行に出典タグ（design_context）を付け、未取得のウェイトが残る間は読込設定を確定しない。

### 1-2. 読込方式の優先順位

1. 案件の既存規約（案件側 `MyBrain/rules/` にフォント運用規約があればそれに従う）
2. オープンライセンスのフォント（Google Fonts 等）: woff2 を self-host するか CDN 読込するかは案件規約に従う。指定が無ければ self-host を既定とする（外部依存と表示タイミングの制御のため。本仕様の規定）
3. 商用フォント（Adobe Fonts・モリサワ等）: ライセンスと配信方式はサービス既定に従い、契約の有無を kazu に確認してから読込方法を決める
4. 入手不可 → §2 の代替判断フローへ

### 1-3. 読込の実装規定

- 使用するウェイト・スタイルのみを読み込む（全ウェイト一括読込をしない）。
- 形式は woff2 を優先。`font-display: swap` を既定とし、変更は案件判断。ファーストビューで使う書体のみ `preload` を検討する。
- 日本語フォントはサブセット化を検討する（対象文字の決め方は案件側規約を参照）。
- **合成スタイルの禁止**: 読み込んでいないウェイト・イタリックをブラウザが合成しないよう `font-synthesis: none;` を指定する。理由: Figma は実フォントの字形で描画しており、合成太字・合成斜体は字形が別物になるため（本仕様の規定）。
- `font-family` の末尾には必ず総称ファミリ（`sans-serif` 等）を付ける。

## 2. 代替フォント時の判断フロー

1. **完全一致**（同名ファミリ・同ウェイト・同スタイル）が入手可能 → それを使用する。
2. **同ファミリだが該当ウェイトが無い** → 近いウェイトへの独断置換を禁止。「そのウェイトが必要か、別ウェイトでよいか」をデザイナー（不在時は kazu）に確認する。
3. **ファミリ自体が入手不可**（商用フォント未契約等）→ エージェントは代替フォントを確定しない。書体分類（サンセリフ/セリフ/丸ゴシック等）と字形の近さで候補を挙げ、デザイナー/kazu の承認を得る。承認までは実装を「暫定」とし、システムフォントスタックを仮置きした旨を報告に明記する。
- 検証（Q-09）では「意図したフォントで実際に描画されたか」を確認する。実ブラウザで `document.fonts.check()` 等により読込成否を確かめ、読込失敗による fallback 描画のまま PASS にしない（本仕様の規定。検証手順の詳細は Q-09）。

## 3. 単位変換規則

数値はすべて出典タグ付き実値から変換する（Q-01 §3）。換算式は Q-02 §2-2-1 と共通。

| 項目 | Figma側 | CSS側 | 規則 |
|---|---|---|---|
| font-size | px 実値 | px（rem 規約は案件側 `MyBrain/rules/units.md` 優先） | 実値転記 |
| line-height（px指定） | px 実値 | 単位なし比率 | lineHeightPx ÷ fontSizePx（Q-02 §2-2-1） |
| line-height（%指定） | フォントサイズに対する%【公式・出典1】 | 単位なし比率 | % ÷ 100 |
| line-height（Auto） | フォント既定の行高。**書体ごとに異なる**【公式・出典1】 | 単位なし比率 | 解決済みの px 実値を取得して換算する。px 実値が取れない場合は「未確認」で停止。**CSS `normal` への置換は禁止**（§4 既知例2） |
| letter-spacing（px指定） | px 実値 | em | letterSpacingPx ÷ fontSizePx（Q-02 §2-2-1） |
| letter-spacing（%指定） | フォントサイズに対する% | em | % ÷ 100 |
| letter-spacing（tracking形式） | 1/1000 em 単位 | em | tracking ÷ 1000【公式・出典1の換算式】 |

### 3-1. その他のテキストプロパティの変換

本節は Q-04 の**正式な合否対象**である（kazu 承認により合否基準へ組み入れ済み — QUESTIONS.md 更新履歴 2026-07-13「Q-04合否基準の拡張」）。Figma 側のフィールドは REST API の TypeStyle オブジェクトに公式定義されている【公式・出典3】。design_context に現れない場合は REST TypeStyle を補完手段とする（出典タグ `rest:typestyle`）。

| Figma（TypeStyle）【公式・出典3】 | 値 | CSS |
|---|---|---|
| `textCase` | ORIGINAL / UPPER / LOWER / TITLE / SMALL_CAPS / SMALL_CAPS_FORCED | 無指定 / `text-transform: uppercase` / `lowercase` / `capitalize` / `font-variant-caps: small-caps` / `all-small-caps` |
| `textDecoration` | NONE / UNDERLINE / STRIKETHROUGH | 無指定 / `text-decoration: underline` / `line-through` |
| `textAlignHorizontal` | LEFT / RIGHT / CENTER / JUSTIFIED | `text-align: left / right / center / justify` |
| `textAlignVertical` | TOP / CENTER / BOTTOM | テキストボックス内の垂直位置として親の flex（`align-items` 等）または padding で再現（CSS の `vertical-align` ではない点に注意） |
| `paragraphSpacing`（px） | 段落間隔 | 後続段落の `margin-top`（余白方向の規約に従う） |
| `paragraphIndent`（px） | 字下げ | `text-indent` |
| `listSpacing`（px） | リスト項目間隔 | `li + li { margin-top }` |
| `textTruncation: ENDING` + `maxLines` | 省略表示 | maxLines = 1: `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` ／ maxLines > 1: `display: -webkit-box; -webkit-line-clamp: {maxLines}; -webkit-box-orient: vertical; overflow: hidden;` |
| `openTypeFlags`（Map<String, Number>） | OpenType 機能の on/off | `font-feature-settings: "{タグ}" {1/0}`（フラグ名を OpenType の4文字タグへ写像。写像できないフラグは未確認として停止） |
| 可変フォントの軸（wght 等） | TypeStyle に軸フィールドの公式定義を**確認できていない**（出典3 の取得範囲に記載なし） | 可変フォント使用時は `font-variation-settings` の値をデザイナーから受領する。REST 実値に軸情報が現れた場合は本表へ追記する |

## 4. Figmaとブラウザのレンダリング差（既知例）

新しい差異を発見したら、本節に日付・再現条件付きで追記する。

- **既知例1: Vertical trim（leading-trim）はブラウザ未サポート**【公式・出典1】。Figma で vertical trim を有効にすると Dev Mode に `leading-trim: both;` と表示されるが、公式ドキュメント自体が「ブラウザで広くサポートされていないドラフト機能」と明記している。
  - 運用: vertical trim が有効なテキストは、行ボックスの上下（half-leading）が Figma と一致しない前提で扱う。余白合わせは隣接要素側の margin で調整し、Q-09 の照合はテキストのグリフ実描画位置（ink範囲）で行う。
- **既知例2: line-height Auto と CSS `normal` は同値にならない**。Figma の Auto はフォント既定の行高で書体ごとに異なり【公式・出典1】、CSS の `normal` もブラウザ・フォントのメトリクス依存で、両者が一致する保証はない。
  - 運用: Auto のテキストも必ず解決済み px 値を取得・換算して明示指定する（§3）。
- **既知例3: 改行位置が Figma と実装でズレることがある**【実測:MyBrain mistakes.md 2026-07-01】。同じ文言・同等のフォント指定でも、実ブラウザの行分割はコンテナ幅・フォントの実描画幅に依存してズレる。
  - 運用: Figma 照合では文言・**改行位置・行数**を照合項目に必ず含める【実測:MyBrain corrections.md 2026-07-01】。意図的な改行は `<br>` か幅制御かをデザイナー確認事項とする。

## 5. 合否基準との対応

- フォント読込方法: §1
- 代替フォント時の判断: §2
- line-height / letter-spacing の単位変換規則: §3
- Figmaとブラウザのレンダリング差の既知例（1つ以上）: §4（3例）
- text-align・text-decoration・text-case・リスト/段落間隔・truncate（maxLines）・OpenType/可変フォントの変換規則（拡張合否基準）: §3-1

## 出典

1. Figma Help — Explore text properties: https://help.figma.com/hc/en-us/articles/360039956634 （2026-07-13 取得。line height Auto の定義・%の基準・tracking 換算式・vertical trim のブラウザサポート状況）
2. 共通Vault `rules/mistakes.md`（2026-07-01）、`rules/corrections.md`（2026-07-01）
3. Figma REST API — File property types（TypeStyle）: https://developers.figma.com/docs/rest-api/file-property-types/ （2026-07-13 取得。textCase / textDecoration / textAlignHorizontal・Vertical / paragraphSpacing / paragraphIndent / listSpacing / textTruncation / maxLines / openTypeFlags の公式定義）

## 編集履歴

- 2026-07-13 claude: 初稿（イテレーション6）
- 2026-07-13 claude: 横断監査（STATE.md Escalations 2026-07-13）の指摘を反映。§3-1 に TypeStyle 公式フィールド（出典3）に基づくその他テキストプロパティの変換表（textCase / decoration / align / 段落・リスト間隔 / truncate+maxLines / openTypeFlags / 可変フォントは未確認扱い）を追加。合否基準への組み入れは kazu の設問管理判断として提案中
- 2026-07-13 claude: 批評[40]の指摘を反映。kazu 承認による合否基準拡張（QUESTIONS.md 更新履歴 2026-07-13）を受け、§3-1 の「合否基準の範囲外」と §5 の「合否基準外の拡張」の表記を「正式な合否対象」へ同期
