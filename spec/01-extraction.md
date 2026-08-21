# 01. デザイン情報の取得（Q-01）

- 設問: Figmaからどの情報を、どのツール・APIで取得するか？
- 状態: 合格（kazu の確定承認待ち。批評記録は STATE.md [2][4][32]）

## 方針

デザイン情報の取得は **Figma MCP サーバーを一次手段**とし、REST API は補完に留める。理由は、実装エージェントが会話内で直接呼び出せること、および Variables REST API が Enterprise プラン限定（出典1）で案件によっては使えないため。この方針は `spec/DECISIONS.md` の **D-01 として採用済み**（2026-07-14 kazu 承認）。

根拠の凡例:
- 【公式】Figma 公式ドキュメント（末尾の出典URL、2026-07-13 取得）
- 【実測:MyBrain】共通Vault（`C:\AI\vault`）の `rules/mistakes.md` / `rules/corrections.md` に記録済みの実案件での実測。記号名は既存spec全体で使うため `MyBrain` のまま据え置く（2026-07-29 のフォルダ改名時に呼称のみ更新）
- 【実測:スキーマ】本実行環境（Claude Code + Figma MCP）のツールスキーマ定義で確認（2026-07-13）。MCPツールの提供有無・パラメータは接続環境により異なり得るため、案件開始時にツール一覧で再確認する
- 【仮説】出典なし。検証されるまで判断根拠にしない

## 1. 取得すべき情報 × 取得手段の対応表

| # | 情報カテゴリ | 具体項目 | 一次手段（Figma MCP） | 補完手段 |
|---|---|---|---|---|
| 1 | ノード構造 | 階層、ノードID、ノード名、種類、x/y座標、幅・高さ | `get_metadata`（疎XML）【公式】 | REST `GET /v1/files/:key` |
| 2 | スタイル・レイアウト | Auto Layout（方向・gap・padding・整列）、fills、角丸、effects、font-size / line-height / letter-spacing / color | `get_design_context`【公式】 | REST file JSON |
| 3 | テキスト内容 | 文言、改行位置、テキスト階層 | `get_design_context`【公式】 | REST file JSON |
| 4 | デザイン変数・スタイル | 色・spacing・タイポグラフィの Variables / Styles（トークン名と値） | `get_variable_defs`【公式】 | REST `GET /v1/files/:key/variables/local`（**Enterprise限定**【公式・出典1】） |
| 5 | 見た目の基準 | 対象ノードのレンダリング実物（照合・ピクセル実測用） | `get_screenshot`（PNG）【公式】 | REST `GET /v1/images/:key` |
| 6a | ラスターアセット | 写真・ビットマップ画像（元画像と書き出しレンダー） | `download_assets`（raw画像優先）【公式】【実測:スキーマ】 | REST `GET /v1/images/:key` |
| 6b | ベクターアセット | アイコン・ロゴ等のSVG | `download_assets`（`defaultFormat: svg`）【実測:スキーマ】 | REST `GET /v1/images/:key`（format=svg） |
| 7 | コンポーネント対応 | Figmaコンポーネント⇔コードコンポーネントのマッピング、ライブラリ情報 | `get_code_connect_map` / `get_libraries` / `search_design_system`【公式】 | —（詳細は Q-06） |
| 8a | モーション（キーフレーム） | アニメーション対象ノード、キーフレームトラック、イージング曲線 | `get_motion_context`（CSS `@keyframes` / motion.dev 形式の変換済みコードも返す）【実測:スキーマ】 | —（詳細は Q-08） |
| 8b | プロトタイプ（画面遷移・hover等のインタラクション定義） | トリガー、遷移先、トランジション種別 | MCP専用ツールは無し（公式ツール一覧の取得結果【出典2】と本環境スキーマのいずれにも該当なし） | REST file JSON の `interactions` / `transitionNodeID` / `transitionDuration` / `transitionEasing`（FRAME/COMPONENT/INSTANCE に公式定義【公式・出典5】）。判定条件と運用は Q-08 §1-2 |

## 2. 各手段の限界（取れない情報・注意点）

### get_metadata
- 返るのは ID・名前・種類・位置・サイズのみの疎XML。**スタイル値・テキスト値は含まれない**【公式】。
- nodeId を省略するとトップレベルのページ一覧になる。大規模デザインでは対象ノードを絞った呼び出しが必要【公式】。

### get_design_context
- 出力は**コード表現**であり、Figma の生データではない。既定の形式は React + Tailwind で、フレームワーク指定パラメータで変更できる【公式・出典2の「get_design_context: Code output (default React + Tailwind), Key Parameters: Framework specification」】。値の転記時は表現形式（例: `text-[40px]`）からの読み取りになるため、取得時に使った形式（既定のままか、指定した場合はその指定値）を spec の note に記録し、再取得時に同一条件で呼ぶ。
- **スケール操作の残骸値が混入することがある**。兄弟要素間で比率が不揃いな外れ値は、`get_screenshot` のグリフ実寸で実在を確認するまで転記しない【実測: mistakes.md 2026-07-06】。
- **塗りが無いノードの背景は出力に現れない**。「背景指定なし＝白/黒」と決めつけず「未取得」として扱い、`get_variable_defs` または個別スクリーンショットのピクセル実測で確定する【実測: mistakes.md 2026-07-05】。

### get_variable_defs
- 返るのは**選択範囲（対象ノード）で使用されている** Variables / Styles【公式】。ファイル全体の変数ライブラリの網羅取得や、モード（ライト/ダーク等）別の値の取得可否は**未確認**。Q-02 の起草時に実測で確認する。

### get_screenshot
- 単一ノードのみ・常にPNG【公式】。数値は返らないため、寸法・色の根拠に使う場合はピクセル実測を伴う（「screenshot実測」として出典タグを付ける）。

### download_assets（ラスター/ベクター別の責務）
- **呼び出しノード数の上限は接続面で異なる**: 公式リモートMCPサーバーの仕様は「1回に最大20ノード。超過時は `rawImagesTruncated: true` が返り、より具体的な子ノードの指定を推奨」【公式・出典2】。一方、本実行環境（claude.ai Figma コネクタ）のツールスキーマは `nodeId` を**1件のみ**受け付ける【実測:スキーマ】。案件開始時に実際のツールスキーマを確認し、それに合わせて取得計画を立てる（公式仕様＝全接続面の仕様ではない点に注意）。
- 返るのは（対象ノードごとに）①書き出しレンダー ②サブツリー内で fills として見つかった元画像（JPEG/PNG/GIF/WebP、最大20件、実形式を示す `format` フィールド付き）【実測:スキーマ】【公式・出典2】。
- 書き出し形式は `defaultFormat`（`png` / `jpg` / `svg` / `pdf`）と `defaultScale`（0.01-4）で指定できる。指定した場合は Figma 側の export 設定を上書きし、省略した場合はノードの export 設定→無ければ png・scale 1【実測:スキーマ】。
- Figma側にexport設定が無い場合、レンダリングは**長辺約4096pxまで**【公式・出典2】。
- 返却URLは一時的。取得後すぐローカルへ保存する【実測:スキーマ】。
- **ラスター（写真・ビットマップ）**: 元画像（raw）を優先する。書き出しレンダーは再圧縮・背景合成が入り得るため。特に透過PNGは node export で白背景が混入する場合があり、raw asset を優先し、αチャンネルの透明ピクセル数を確認する【実測: mistakes.md 2026-06-30】。
- **ベクター（アイコン・ロゴ）**: `defaultFormat: svg` で書き出す。SVGで取得できない・破綻する場合は Q-05 の形式選択基準に従いフォールバックする。
- **失敗時・要件外の場合の補完経路**: `download_assets` で取得できない形式・解像度が必要な場合は REST `GET /v1/images/:key` を使う。解像度不足は「Figma側で高解像度元画像が必要」として報告し、拡大生成で補わない【実測: mistakes.md 2026-06-30】。

### get_motion_context
- 返るのはキーフレームアニメーション情報（対象ノード一覧・キーフレームトラック・イージング・CSS/@keyframes と motion.dev の変換済みコード・`recursive` 指定でサブツリー全体）【実測:スキーマ】。
- 公式ドキュメントのツール一覧取得結果（出典2）には本ツールの記載を確認できていない。仕様の安定性は未確認のため、案件開始時に提供有無を再確認する。
- プロトタイプのインタラクション定義（クリック遷移・hover トリガー等）まで返すかは**未確認**。Q-08 起草時に実測する。

### REST API（補完手段）
- Variables API（`/v1/files/:key/variables/local`）は **Enterpriseプラン＋組織メンバー＋`file_variables:read`スコープが必要**。ゲストアカウントは不可【公式・出典1】。非Enterprise案件ではトークン取得は `get_variable_defs` のみとなる。

### どの手段でも取れない情報（デザイナー確認が必要）
- デザインに存在しない中間ビューポート幅の挙動（Q-07）
- Figmaプロトタイプに定義されていない hover / focus / アニメーション仕様（Q-08）
- 「デザインのズレか意図か」（例: 同種要素間の1pxの不揃い）の判断

## 3. 取得の標準手順

1. **URL確定**: Figma URL から fileKey と node-id を確定する。node-id が無いURLでは実装に進まず停止する【実測ルール: corrections.md 2026-07-09】。
2. **構造把握**: `get_metadata` で対象ノードの階層・座標・サイズを取得する。
3. **見た目の基準保存**: 対象ノードの `get_screenshot`（個別）を取得・保存する。
4. **実値取得**: `get_design_context` でスタイル・テキスト実値を取得する。
5. **トークン取得**: `get_variable_defs` で使用中の Variables / Styles を取得する。
6. **アセット取得**: `download_assets` で画像・SVGを取得する（ノード数上限は接続面で異なる — §2。raw画像はサブツリーから最大20件。ラスターは raw 優先、ベクターは `defaultFormat: svg`）。
7. **モーション取得（該当時のみ）**: デザインにアニメーション指定がある場合は `get_motion_context` でキーフレーム情報を取得する。
8. **出典タグ付け**: 取得した各値に出典（`metadata` / `design_context` / `variable_defs` / `screenshot実測` / `asset実測`）を付ける。**出典の無い値・計算や推測で補った値は `inferred` として隔離し、仕様・検証基準に使わない**【実測ルール: corrections.md 2026-07-09】。未取得欄が残る間は次工程（実装）に進まない。

## 4. 合否基準との対応

- 取得情報一覧と手段の対応表: §1
- 各手段の限界: §2
- （補足）取得順序と未取得時の停止規則: §3

## 出典

1. Figma REST API — Variables: https://developers.figma.com/docs/rest-api/variables/ （2026-07-13 取得。Enterprise限定・スコープ要件）
2. Figma MCP Server — Tools and prompts: https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/ （2026-07-13 取得。ツール一覧・各ツールの返却内容と上限）
3. Figma MCP Server — 概要: https://developers.figma.com/docs/figma-mcp-server/ （2026-07-13 取得）
4. 共通Vault `rules/mistakes.md`（2026-06-30 / 2026-07-05 / 2026-07-06）、`rules/corrections.md`（2026-07-09）— 実案件での実測記録
5. Figma REST API — File node types: https://developers.figma.com/docs/rest-api/file-node-types/ （2026-07-13 取得。プロトタイプ関連フィールドの公式定義）

## 編集履歴

- 2026-07-13 claude: 初稿（イテレーション1）
- 2026-07-13 claude: 批評[2]の指摘4点を反映（イテレーション2）。①モーション行を get_motion_context の実測に基づき 8a/8b に分割 ②get_design_context の出力形式に出典と取得条件の記録規則を追記 ③アセットをラスター/ベクター別の責務・フォールバック経路に再構成し、download_assets の上限をツールスキーマ実測値（1ノード/回・raw最大20件）に訂正 ④方針の判断を spec/DECISIONS.md（D-01・提案）へ記録
- 2026-07-13 claude: Q-08 起草時の確認結果を反映。8b（プロトタイプ）の補完手段を「仮説」から REST の公式フィールド（interactions / transition*、出典5）へ確定（Q-01 自身が予告していた Q-08 での確定作業）
- 2026-07-13 claude: 横断監査（STATE.md Escalations 2026-07-13）の指摘を反映。download_assets のノード数上限を「1ノード/回」の断定から訂正: 公式仕様は最大20ノード/回（rawImagesTruncated）、本環境コネクタのスキーマは1ノード/回で、接続面により異なることを明記（環境スキーマを公式仕様と同一視した初稿の誤り）
