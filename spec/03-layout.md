# 03. Auto Layout のレイアウト変換（Q-03）

- 設問: Auto Layoutをどのようなレイアウトコードに変換するか？
- 状態: 合格（kazu の確定承認待ち。批評記録は STATE.md [8][10][32][39][42]）

## 方針

Auto Layout は **CSS Flexbox へ機械的に写像**する（Grid モードのみ CSS Grid）。全要素を絶対座標に転写する実装（position: absolute の羅列）は禁止し、絶対配置は「Ignore auto layout の子」と「非 Auto Layout フレーム」に限定する。禁止の理由: 可変ビューポート（Q-07）とテキスト量の変化に耐えるレイアウトはフローで組む必要があるため（本仕様の規定）。

変換に使う数値は Q-01 の出典タグ付き実値のみ。目分量・推測値の転記は禁止【実測:MyBrain mistakes.md 2026-06-25】。

根拠の凡例は Q-01 と同じ:【公式】【実測:MyBrain】【実測:スキーマ】【仮説】

## 1. 対応表（Auto Layout プロパティ → CSS）

Figma 側のプロパティ名と意味は公式ヘルプ（出典1）に基づく。CSS 側の割当は本仕様の規定。

| Auto Layout プロパティ | 値 | CSS |
|---|---|---|
| 方向 | Horizontal | `display: flex; flex-direction: row;` |
| 方向 | Vertical | `display: flex; flex-direction: column;` |
| 方向 | Grid | `display: grid;` 変換規則は **1-2（REST 公式フィールドから確定変換）** |
| Gap between（数値） | Npx | `gap: Npx;` |
| Gap between（Auto） | 主軸方向へ最大配分【公式・出典1】 | `justify-content: space-between;`（このとき `gap` は指定しない） |
| Padding | 一括 / 上下・左右 / 4方向個別 | `padding`（個別値はそのまま4方向へ転記） |
| 整列（主軸） | start / center / end | `justify-content: flex-start / center / flex-end;`（Gap=Auto 時は space-between が優先） |
| 整列（交差軸） | start / center / end / baseline | `align-items: flex-start / center / flex-end / baseline;` |
| サイズ Hug contents | 内容に追従して最小化【公式・出典1】 | 主軸: `flex: 0 0 auto;` ／ 交差軸: 指定なし（内容依存）。明示が必要な文脈のみ `fit-content`（詳細は 1-1） |
| サイズ Fill container | 親の空きを占有【公式・出典1】 | 主軸: `flex: 1 0 0;` ／ 交差軸: `align-self: stretch;`（省略条件は 1-1） |
| サイズ Fixed | 実寸固定 | 主軸: `flex: 0 0 実値px;` ／ 交差軸: `width / height: 実値px;`（単位規約が案件側にあれば案件側 `MyBrain/rules/units.md` を優先） |
| Min / Max | 最小・最大寸法【公式・出典1】 | `min-width / max-width / min-height / max-height` へ実値を転記 |
| 折り返し（Wrap） | 横フローの折返し | `flex-wrap: wrap;` |

### 1-1. サイズモードの適用規則と境界ケース

Figma のサイズモード（Hug / Fill / Fixed）は**水平・垂直それぞれに1つ**設定される【公式・出典1】。したがって変換も軸ごとに独立して行い、同一軸で複数モードが衝突するケースは発生しない。「主軸/交差軸」は親の flex-direction によって水平・垂直のどちらかに割り当てて読み替える。

| 水平 × 垂直の組み合わせ | 変換（親が Horizontal の場合の例） |
|---|---|
| Fill × Hug | `flex: 1 0 0;`（高さ指定なし） |
| Fill × Fill | `flex: 1 0 0; align-self: stretch;` |
| Hug × Fill | `flex: 0 0 auto; align-self: stretch;` |
| Fixed × Fill | `flex: 0 0 Wpx; align-self: stretch;` |
| Fill × Fixed | `flex: 1 0 0; height: Hpx;` |

- `align-self: stretch` の省略条件: 親の `align-items` が stretch（CSS の既定値）であり、かつ交差軸整列が Figma 側で未指定の場合のみ省略できる。親に `align-items: center` 等の整列指定がある場合、Fill の子には**必ず** `align-self: stretch` を個別指定する（親指定が子に継承されて潰れるのを防ぐ）。
- Min/Max と Fill の併用: `flex: 1 0 0` のまま `min-* / max-*` を追加する（flex-basis は変更しない）。
- Fill の子しか無い行で幅が割り切れない場合の1px差はブラウザの分配に委ね、個別補正しない（補正が必要な差分は Q-09 の検証で検出する）。

### 1-2. Grid モードの変換（REST 公式フィールドから確定）

Figma REST API は `layoutMode: "GRID"` と以下の grid 専用フィールドを公式定義している【公式・出典3】。取得は REST `GET /v1/files/:key?ids=<nodeId>`（出典タグ `rest:grid`）。

| Figma（REST フィールド）【公式・出典3】 | CSS |
|---|---|
| `gridColumnsSizing`（String。「CSS grid-template-columns プロパティ用の文字列」と公式定義） | `grid-template-columns:` へ**そのまま転記** |
| `gridRowsSizing`（String） | `grid-template-rows:` へそのまま転記 |
| `gridColumnGap` / `gridRowGap`（Number, px） | `column-gap` / `row-gap` |
| `gridItemsPositioning: "ROW_AUTO_FLOW"` | `grid-auto-flow: row;`（子の明示配置は省略） |
| `gridItemsPositioning: "MANUAL"`（既定） | 子を明示配置（下の行） |
| 子の `gridColumnAnchorIndex`（0始まり）+ `gridColumnSpan` | `grid-column: {anchorIndex + 1} / span {span};`（CSS のグリッド線は1始まりのため +1）。`grid-row` も同様 |
| 子の `gridChildHorizontalAlign` / `gridChildVerticalAlign`（既定 AUTO） | AUTO は無指定。AUTO 以外の値は公式ドキュメントに値一覧の記載を確認できていないため、遭遇時に REST 実値を確認して本表へ追記する（それまで当該子のみ未確認として停止） |
| `gridAutoTracks`（NONE / ROWS） | ROWS（自動行生成）の CSS 対応（`grid-auto-rows` の値の出所）は**未確認**。遭遇時に実測して本表へ追記する |

- REST が使えない案件（APIトークン未発行等）に限り、従来どおり Grid フレームは自動変換の対象外（停止・エスカレーション）とする。
- `get_design_context` の出力に Grid 相当の値が現れる場合は補助として使ってよいが、変換の一次手段は REST とする（§5-1 の実測は「design_context で足りるか」の確認に位置づけを変更）。

補足規則:
- ネストした Auto Layout はネストした flex コンテナへそのまま対応させる。中間フレームの省略（DOM の平坦化)は、視覚結果が同一でも既定では行わない。省略する場合は Q-06（コンポーネント対応）の判断に従う。
- `gap` が使えない文脈（flex/grid 外）の余白は、縦は後続要素の `margin-top`、横は後続要素の `margin-left` を基本とする【実測:MyBrain corrections.md 2026-07-01】。

## 2. Ignore auto layout（絶対配置の子）の扱い

- Figma の「Ignore auto layout」は、フローから外して親フレーム基準で自由配置する指定【公式・出典1】。
- 変換規則: 親フレームに `position: relative;` を付け、対象の子を `position: absolute;` にする。座標は `get_metadata` の x/y（親基準へ換算）から `left / top` へ転記する。
- 対象の子に Constraints が設定されている場合は §3 の規則でアンカー方向（left/right/top/bottom）を決める。

## 3. Constraints の扱い（非 Auto Layout フレーム内・絶対配置の子）

Figma 側の意味は公式ヘルプ（出典2）に基づく。CSS 側の割当は本仕様の規定。水平・垂直は独立に適用する。

| Constraint（水平） | Figmaの挙動【公式・出典2】 | CSS |
|---|---|---|
| Left | 左端からの位置を維持 | `left: Npx;` |
| Right | 右端からの位置を維持 | `right: Npx;` |
| Left and Right | 両端からの距離を維持（伸縮） | `left: Npx; right: Mpx;`（width は指定しない） |
| Center | 水平中央との相対位置を維持 | 確定式は 3-1 |
| Scale | 親に対する比率で伸縮 | 確定式は 3-2 |

垂直（Top / Bottom / Top and Bottom / Center / Scale）も同じ規則を `top / bottom / height / translateY` に読み替えて適用する。

### 3-1. Center の確定式

入力（すべて `get_metadata` の実値。1つでも未取得なら変換せず停止する — Q-01 §3）:
- `offset` = (child.x + child.width / 2) − parent.width / 2 （親座標系に換算した px。正 = 中央より右）

生成規則（疑似コード。垂直は x→y、width→height、left→top、translateX→translateY に読み替え）:

```
if (要素が transform を別用途で使わない) {
    left: 50%;
    transform: translateX(calc(-50% + {offset}px));   // offset = 0 なら translateX(-50%)
} else if (child.width が Figma 実値で確定している) {
    left: calc(50% - {child.width / 2}px + {offset}px);   // transform 不使用の代替形
    // 代替形を使った旨と理由を spec の note に記録する
} else {
    停止;  // transform 衝突 かつ 幅未確定 は自動変換不可。エスカレーション
}
```

- 「transform を別用途で使う」の判定基準: その要素にアニメーション・ホバー効果等で `transform` を書く予定が実装計画（Q-08 の出力）にあるか、既存コードで `transform` を持つ場合。
- `%` と `px` の混在は `calc()` で明示し、暗黙の足し算をしない。

### 3-2. Scale の確定式

入力（すべて `get_metadata` の実値。parent.width / parent.height が未取得なら停止）:

```
left%   = round(child.x / parent.width × 100, 小数第2位)
width%  = round(child.width / parent.width × 100, 小数第2位)
top%    = round(child.y / parent.height × 100, 小数第2位)
height% = round(child.height / parent.height × 100, 小数第2位)
```

- 丸めは四捨五入・小数第2位まで。丸めた結果は Q-09 の検証で「Scale 由来の%指定」と分かるよう出典タグに `scale換算` を付け、許容差分の判定（Q-11）ではこの丸め誤差（親幅×0.005% 以下）を考慮する。
- 水平が Scale・垂直が Left/Top 等の固定という**軸違いの組み合わせは軸ごとに独立適用**する（水平は%指定、垂直はpx指定の混在を許す）。
- 「Left and Right（両端固定）＋ Fixed サイズ」のような Figma 上あり得ない組み合わせ（両端固定は伸縮が前提）が取得値に現れた場合は、取得ミスとみなし再取得する。再取得でも同じなら「矛盾値」としてデザイナー確認に回す。

## 4. 禁止事項・実装時の確認

- **座標転写の禁止**: Auto Layout が設定されているフレームを `position: absolute` の羅列に変換しない（§方針）。
- **PC/SP の HTML 重複禁止**: レイアウト差は同一 HTML に対する CSS（メディアクエリ）で吸収する【実測:MyBrain corrections.md 2026-06-27】。ブレークポイントの決め方は Q-07。
- 変換後にズレを指摘された場合の診断手順は共通Vault `rules/corrections.md`（2026-07-01 の診断表）に従い、DOM 構造 → 修飾クラス → display/grid/flex/order → カスケード → 親の寸法・余白 → 子の寸法・余白 → 細部の順で確認する。

## 5. 未確認事項と実測方針

未確認事項は、確認までは該当機能を「未確認」として扱い、推測で変換規則を確定させない（Q-01 §3 の停止規則）。

**Grid モードの実装/停止の判定は §1-2 が唯一の規則**であり、本節はそれを変更しない。整理すると:
1. REST が取得可能で、§1-2 の表に定義済みのフィールド値のみで構成される Grid → **変換する**（停止しない）
2. REST 不可の案件 → 当該 Grid フレームを停止・エスカレーション（§1-2）
3. REST 取得可能でも**未定義値に遭遇した範囲のみ**停止する（例: `gridAutoTracks: ROWS`、AUTO 以外の `gridChild*Align`。§1-2 の表の該当行に従い、当該子・当該プロパティ単位で未確認として止め、フレーム全体は止めない）
4. §5-1 の実測は「design_context という**補助手段**で足りるか」の確認であり、変換の前提条件ではない（未実施でも 1. の変換は行える）

### 5-1. Grid モードの design_context 出力形の実測方針（補助手段の確認。変換の一次手段は §1-2 の REST）

- 採取ノード: Auto Layout の方向を Grid に設定したフレームを2種類用意する（kazu の Figma アカウントでテストファイルを作成するか、Grid を含む実案件の最初のノードを使う）。①列2×行2以上・スパンなし ②列スパンまたは行スパンを含むもの。
- 測定項目（各ノードで記録する）:
  1. `get_design_context` の出力に `display: grid` 相当（`grid` / `grid-cols-*` 等）が現れるか、flex の近似に落ちるか
  2. 列・行の定義（`grid-template-columns / rows` 相当）が実値で出力されるか
  3. スパン（`col-span-*` / `grid-column` 相当）が保持されるか
  4. `get_metadata` の子ノード座標から列・行構造を再構成できるか（出力が不十分な場合のフォールバック用）
- 検証例（合格条件）: 測定項目1-3がすべて「保持される」なら §1 の Grid 行を「design_context の値を転記」で確定する。保持されない項目がある場合は、項目4の座標再構成手順を §1 に正式化する。
- 実測結果は本節に日付・fileKey・nodeId 付きで追記し、STATE.md に記録する。

### 5-2. Min/Max と Hug の併用時の出力表現

- 採取ノード: Hug＋min-width を設定したテキストボタン等1ノード。
- 測定項目: design_context に min/max が明示されるか。されない場合は Figma UI 上の設定値をデザイナーから受領する運用にする。

## 6. 検証対応（Figma実測値 → CSSプロパティ）

各CSSプロパティの入力となる Figma 実値と出典タグの対応。出典タグの無い値は使わない（Q-01 §3 の停止規則と同一）。

| CSSプロパティ | 入力となる Figma 実値 | 出典タグ |
|---|---|---|
| `flex-direction` / `display` | Auto Layout の方向 | design_context |
| `gap` | Gap between の数値 | design_context |
| `justify-content` / `align-items` | 整列・Gap Auto | design_context |
| `padding` | Padding 4方向 | design_context |
| `width` / `height` / `flex-basis` | Fixed の実寸 | design_context（外れ値は screenshot実測で確認 — Q-01 §2） |
| `min-*` / `max-*` | Min/Max 設定値 | design_context（出ない場合はデザイナー受領 — §5-2） |
| `left` / `top` / `offset`（§3-1, §3-2） | ノードの x / y / width / height | metadata |
| `grid-template-*` ほか Grid 系 | gridColumnsSizing / gridRowsSizing / gridColumnGap / gridRowGap / 子の anchor・span（§1-2） | rest:grid |

## 7. 合否基準との対応

- 主要プロパティ（方向・gap・padding・整列・hug/fill）→ Flex/Grid の対応表: §1（境界ケースは 1-1）
- absolute 配置の扱い: §2
- constraints の扱い: §3（Center/Scale の確定式は 3-1 / 3-2）
- Grid モードは §1-2 の REST 確定変換で規則化（停止は「REST 不可の案件」または「未定義値に遭遇した当該範囲のみ」— §5 の整理 1-4 と同一規則。§5-1 は補助手段の実測であり変換の前提条件ではない）

## 出典

1. Figma Help — Guide to auto layout: https://help.figma.com/hc/en-us/articles/360040451373 （2026-07-13 取得。方向3種・Gap Auto の意味・Padding・Hug/Fill/Fixed・Min/Max・Ignore auto layout）
2. Figma Help — Apply constraints: https://help.figma.com/hc/en-us/articles/360039957734 （2026-07-13 取得。各 Constraint のリサイズ挙動）
3. Figma REST API — File node types: https://developers.figma.com/docs/rest-api/file-node-types/ （2026-07-13 取得。layoutMode: GRID と grid 系フィールド（gridColumnsSizing / gridRowsSizing / gap / span / anchor / gridChild*Align / gridAutoTracks / gridItemsPositioning）の公式定義）
4. 共通Vault `rules/corrections.md`（2026-06-27 / 2026-07-01）、`rules/mistakes.md`（2026-06-25）

## 編集履歴

- 2026-07-13 claude: 初稿（イテレーション4）
- 2026-07-13 claude: 批評[8]の指摘4点を反映（イテレーション5）。①Grid モードを「実測確定まで自動変換停止」と規則化し、§5-1 に実測方針（採取ノード・測定項目・合格条件）を追加 ②Center/Scale の確定式（3-1 / 3-2、疑似コード・width未確定時とtransform衝突時の分岐・丸め規則）を追加 ③サイズモードの軸別適用と境界ケースを 1-1 に列挙 ④§6 に Figma実測値→CSSプロパティの検証対応表を追加
- 2026-07-13 claude: 横断監査（STATE.md Escalations 2026-07-13）の指摘を反映。Grid の「停止扱い」を撤回し、§1-2 に REST 公式フィールド（layoutMode: GRID・gridColumnsSizing 等、出典3）からの確定変換規則を追加。§5-1 は補助手段（design_context）の確認に位置づけ変更。停止は REST 不可の案件のみに限定
- 2026-07-13 claude: 批評[39]の指摘を反映。§5 冒頭の「§1 のとおり自動変換を停止」という旧文言を削除し、Grid の実装/停止判定を §1-2 に一本化する整理（1. REST可＋定義済み値=変換 / 2. REST不可=停止 / 3. 未定義値は当該範囲のみ停止 / 4. §5-1 は補助手段の実測で変換の前提条件ではない）を明文化。§7 の対応行も同期
