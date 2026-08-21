# 08. インタラクション・モーションの再現（Q-08）

- 設問: インタラクション・モーションをどう再現するか？
- 状態: 合格（kazu の確定承認待ち。批評記録は STATE.md [20][22]）

## 方針

情報源の優先順位を固定する: ① `get_motion_context` のキーフレーム実値 → ② Figma 上の状態バリアント/別フレームの design_context 実値 → ③ どちらも無い場合は本節の既定値（§2-2）。既定値で実装した箇所は「既定値適用」として一覧化し、デザイナー確認に回す。推測で「デザイン意図のモーション」を創作しない。

根拠の凡例は Q-01 と同じ:【公式】【実測:MyBrain】【実測:スキーマ】【仮説】

## 1. 取得方法

### 1-1. モーション（キーフレームアニメーション）

- `get_motion_context` で取得する【実測:スキーマ】。返るもの: アニメーション対象ノードの一覧、キーフレームトラックとイージング曲線、変換済みの CSS `@keyframes` / motion.dev コード、`recursive: true` でサブツリー全体。
- 運用: 変換済みコードをそのまま貼らず、値（対象プロパティ・duration・easing・delay）を出典タグ `motion_context` 付きで検証用 spec に記録してから実装する（Q-09 の照合対象にするため）。
- 本ツールは公式ドキュメントのツール一覧で記載を確認できていないため（Q-01 §2）、案件開始時に提供有無を確認し、無い環境では §1-2 と同じ「取得不可」運用にする。

### 1-2. プロトタイプ（遷移・トリガー・hover 定義）

- **取得方法（確定）**: REST API `GET /v1/files/:key?ids=<nodeId>` の該当ノード（FRAME / COMPONENT / INSTANCE）に、次のプロトタイプ関連フィールドが公式定義されている【公式・出典4】:
  - `interactions`（`Interaction[]`）: ノード上のプロトタイプインタラクション一覧（操作方法とその挙動）
  - `transitionNodeID`（String、既定 null）: 遷移先ノードID
  - `transitionDuration`（Number、既定 null）: 遷移時間（ミリ秒）
  - `transitionEasing`（EasingType、既定 null）: 遷移のイージング
- **判定条件（機械評価）**: `interactions` が空配列またはフィールド欠損、かつ `transitionNodeID` が null → 「プロトタイプ定義なし」と判定し、§2-2 の既定値を適用する。値がある場合は取得値に出典タグ `rest:interactions` を付けて転記する。
- **Figma 側で定義され得るトリガーの種類**は公式ヘルプ「Prototype triggers」に列挙されている（On click / On drag / While hovering / While pressing / Mouse enter / Mouse leave / Mouse down / Mouse up / After delay / Keyboard / When video hits / When video ends 等)【公式・出典5】。CSS/JS への対応は §2-1-1。
- **REST が使えない案件**（APIトークン未発行等）: プロトタイプ定義は「取得不可」とし、**デザイナーからのテキスト仕様（トリガー・対象・時間・イージング）を正**とする。テキスト仕様も無いものは §2-2 の既定値。
- `get_design_context` は**インタラクション定義の取得手段として使わない**（出力はコード表現であり、interaction 情報の包含が保証されないため。本仕様の規定）。
- `get_motion_context` がプロトタイプのトリガー情報まで返すかは未確認のまま残る。返した場合は REST より優先してよい（同一出典系の実値のため）が、確認できるまで本節の一次手段は REST とする。

### 1-3. 状態デザイン（hover / open 等が variant・別フレームで描かれている場合）

- `get_metadata` でコンポーネントの variant 名（Default / Hover / Open 等）や状態別フレームの有無を確認し、**各状態の design_context 実値**を取得する。
- 状態間で差分のあるプロパティだけをトランジション対象にする（差分の無いプロパティに transition を張らない）。
- メニュー・モーダル・アコーディオンは「開いた状態」のデザイン取得を必須とする【実測:web-development corrections.md 2026-07-07（開閉両状態の確認漏れの再発防止）】。

## 2. 実装方針

### 2-1. 実装手段の選択

| モーションの種類 | 実装手段 |
|---|---|
| 状態変化のトランジション（hover / focus / open-close） | CSS `transition` |
| キーフレームアニメーション（ループ・入場演出） | CSS `@keyframes`（`get_motion_context` の変換出力を検証の上使用） |
| スクロール連動・複数要素のシーケンス | JS（ライブラリ選定は案件規約。無ければ素の Web API を優先） |

- アニメーション対象プロパティは `transform` と `opacity` を優先し、レイアウトに影響するプロパティ（width / height / top / margin）のアニメーションは避ける（本仕様の規定。例外はアコーディオンの height 制御 §2-3）。

#### 2-1-1. Figmaトリガー → 実装の対応（プロトタイプ定義がある場合）

| Figmaトリガー【公式・出典5】 | 実装 |
|---|---|
| On click / On tap | JS の click イベント（リンク遷移は `<a>` を優先） |
| While hovering / Mouse enter / Mouse leave | CSS `:hover`（enter/leave で挙動が非対称な場合のみ JS mouseenter/mouseleave） |
| While pressing / Mouse down / Mouse up | CSS `:active`（非対称な場合のみ JS pointerdown/pointerup） |
| After delay | CSS `animation-delay` または JS `setTimeout` |
| On drag / Keyboard / When video hits / When video ends | JS で個別実装。工数影響があるためデザイナー/kazu と実装要否を確認してから着手 |

- `transitionDuration`（ms）→ CSS の秒表記へ換算（例: 300 → `0.3s`）。`transitionEasing` は CSS の対応イージングへ写像し、対応が無い場合は `cubic-bezier()` で近似せず「未対応」としてデザイナー確認へ（本仕様の規定）。

### 2-2. 情報が無い場合の既定値

以下を Figma にもテキスト仕様にも情報が無い場合の**既定値として定める**（本仕様の規定。本節の確定承認＝kazu の承認をもって確定値となる。案件側規約に別の既定がある場合はそちらが優先）。適用箇所は一覧にして報告し、デザイナー確認へ回す。

| 対象 | 既定値 |
|---|---|
| リンク・ボタンの hover | `opacity: 0.7` へ `transition: opacity 0.3s ease;` |
| focus | ブラウザ既定の `:focus-visible` 表示を残す。`outline: none` の単独指定を禁止 |
| 開閉 UI（アコーディオン・メニュー）の展開 | 0.3s ease。実装規則は §2-3 |
| 矢印・プラス/マイナス等の開閉アイコン | `transform` のみで切替。**閉じ時だけ要素を生成する実装は禁止**。常時生成して transform で補間する【実測:web-development corrections.md 2026-07-07】 |
| ページ内リンクのスクロール | `scroll-behavior: smooth` |

### 2-3. 既知の実装規則（共通Vault 恒久ルールの継承）

- **アコーディオン**: Web開発プレイブック `rules/accordion.md`（実在パス: `C:\AI\web-development\rules\accordion.md`）に準拠する。要点: `height` と `padding` を同時に変化させない / JSは実高さ `getBoundingClientRect().height` から `scrollHeight` へアニメーション / 完了後は `height: auto` / `data-animating` で多重実行防止【実測:web-development accordion.md】。
- **モーダル・ドロワーのスクロールロック**: スクロールバー幅（`window.innerWidth - document.documentElement.clientWidth`）を body と fixed 要素に補正し、閉アニメーション完了（transitionend）まで補正を解除しない【実測:web-development corrections.md 2026-07-08】。
- **中間状態の確認**: 開閉 UI は開・閉だけでなく開閉途中（例: 80ms 時点）の computed style / transform 中間値まで実ブラウザで確認する【実測:web-development corrections.md 2026-07-07】。
- **動画を含む演出**: Web開発プレイブック `rules/video-embedding.md` の標準形に従う【実測:web-development corrections.md 2026-07-11】。

### 2-4. アクセシビリティ

- `prefers-reduced-motion: reduce` ではアニメーションを省略または即時切替にする。アコーディオンについてはWeb開発プレイブック `rules/accordion.md` に既定があり【実測:web-development accordion.md】、**全アニメーションへの一般化は本仕様の規定**（ユーザーのOS設定を尊重するため）。
- 開閉 UI には `aria-expanded` 等の状態属性を付与する（Figma照合の対象に含める【実測:web-development corrections.md 2026-07-07】）。

## 3. 検証との接続（詳細は Q-09）

- モーションは静止スクリーンショットで検証できないため、開・閉・中間（アニメーション途中）の3状態の実測を検証項目にする。
- `motion_context` の実値（duration / easing / 対象プロパティ）と実装値の照合を機械検証に含める。

## 4. 合否基準との対応

- Figmaのプロトタイプ/モーション情報の取得方法: §1（取得不可時の運用と実測手順を含む）
- hover・トランジション等の実装方針: §2-1 / §2-3
- 情報が無い場合の既定値: §2-2

## 出典

1. 本実行環境の `get_motion_context` ツールスキーマ（2026-07-13 実測。返却内容・recursive パラメータ）
2. Web開発プレイブック `rules/accordion.md`（実在パス: `C:\AI\web-development\rules\accordion.md`。2026-06-27 制定）、`rules/corrections.md`（2026-07-07 / 2026-07-08 / 2026-07-11）、`rules/video-embedding.md`
3. spec/01-extraction.md（Q-01 §1 8a/8b。取得手段と未確認事項）
4. Figma REST API — File node types: https://developers.figma.com/docs/rest-api/file-node-types/ （2026-07-13 取得。FRAME/COMPONENT/INSTANCE の interactions / transitionNodeID / transitionDuration / transitionEasing フィールド定義）
5. Figma Help — Prototype triggers: https://help.figma.com/hc/en-us/articles/360040035834 （2026-07-13 取得。トリガー13種の列挙）

## 編集履歴

- 2026-07-13 claude: 初稿（イテレーション10）
- 2026-07-13 claude: 批評[20]の指摘5点を反映（イテレーション11）。①出典に Figma 公式URL 2件（REST file-node-types / Prototype triggers）を追加 ②プロトタイプ取得を REST の interactions / transition* フィールドで**確定**し、機械判定条件（空配列・null → 定義なし）と REST 不可時の分岐を規定 ③design_context をインタラクション取得手段から除外と明記、2-1-1 にトリガー→実装の対応表を追加 ④§2-2 既定値を「本節の確定承認をもって確定値」と再定義 ⑤reduced-motion の出典を整理（accordion.md は既定の根拠、一般化は本仕様の規定）
