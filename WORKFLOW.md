# WORKFLOW.md — figma-to-code の唯一の実行規則

`C:\AI\figma-to-code` はFigma固有の規則・テンプレート・履歴の唯一の正本です。共通Vaultは上位の汎用原則、`C:\AI\web-development` はWeb実装の正本として先に読む。規則本文をエージェント別の入口へ複製しない。

## Figma実装・修正タスクの開始順

入口（`AGENTS.md` / `CLAUDE.md`）を読んだ直後、他の調査・編集より先に環境判定 `workflow-preflight` を実行する。案件ディレクトリなど本リポジトリ外で作業している場合も同じなので、**cwdに依存しない絶対パスで呼ぶ**。

```bash
node C:\AI\figma-to-code\tools\workflow-preflight.mjs
```

`local` なら下記1〜5を順に読み、`cloud-restricted` なら次節の制限に従う。非0終了、またはJSON判定が得られない場合は着手しない。

本ファイルで `workflow-preflight` と呼ぶものは**環境判定**であり、`rules/figma-spec-pipeline.md` の編集前ゲート `figma:gate preflight` とは別物である。環境判定のPASSは編集前ゲートの代わりにならない。両方を通す。

1. `C:\AI\vault\WORKFLOW.md`
2. `C:\AI\web-development\WORKFLOW.md`
3. 本ファイルと `README.md`
4. `rules/figma-spec-pipeline.md`、`rules/figma-scope-lock.md`、`rules/figma-mcp-implementation.md`、`rules/figma-image-export.md`、`rules/loop-execution.md`、`rules/self-improvement.md`、`rules/correction-log-promotion.md`
5. 案件側 `MyBrain/README.md`、`MyBrain/WORKFLOW.md`、`MyBrain/rules/`、案件側 `LOOP.md` / `STATE.md`

## クラウドセッションでの実行範囲

Claude Code / Codex のクラウドセッションは、このリポジトリのクローンだけを持つ。上の開始順のうち **1（共通Vault）、2（Web Development）、5（案件側 `MyBrain/`）は存在しない**。ユーザースコープのMCP設定も届かない。

クラウド判定の正本は `tools/workflow-preflight.mjs` が**上位層の `WORKFLOW.md` を実際に読めるか**とする。読めない、下限バイト未満、Markdown見出しが無い（空・プレースホルダ）の場合は `cloud-restricted` とする。`CLAUDE_CODE_REMOTE=true` と `CODEX_CI=1` は補助シグナルであり、特定エージェントだけの環境変数を唯一の判定条件にしてはならない。

2026-08-21 実測：Claude Codeのクラウドセッションは `CLAUDE_CODE_REMOTE=true` を持ち、上位層2ファイルはどちらも存在しない。`CODEX_CI=1` はCodexクラウドの申告値であり、本リポジトリでは未実測である。判定はファイルの実読を正本とするため、この値の当否に結果が依存しない構成にしてある。

上位層のルート位置が既定と異なるローカル環境では、`FIGMA_TO_CODE_VAULT_WORKFLOW` と `FIGMA_TO_CODE_WEB_DEVELOPMENT_WORKFLOW` でパスを上書きする。ファイル検査は空・プレースホルダを弾くが、**旧世代のコピーは検出できない**。世代差の検査はこの環境判定の責務ではない。

Figma実装・修正でソースを編集する前は、環境判定を非0で落ちないことまで確認する（`cloud-restricted` は exit 2）。

```bash
node C:\AI\figma-to-code\tools\workflow-preflight.mjs --assert-local
```

`workflow-preflight` が `cloud-restricted` を返したとき、実行してよいのは次に限る。

- このリポジトリ内で完結するテスト・E2E・lintの実行と、その失敗の修正
- `spec/`・`rules/`・`tools/` の静的な整合確認と、機械的に検証できる修正
- 独立レビュー（批評のみ。正本の変更を伴わないもの）

次は実行してはならない。作業を止めてローカルセッションへ差し戻す。

- 案件側 `MyBrain/` を根拠とする判断、および案件側への記録
- 共通Vault・Web Developmentの `corrections.md` / `mistakes.md` への追記と、正本の昇格
- Figma実物との照合を要する実装・修正（fileKey・node-idは案件側にあり、クラウドには無い）
- 実ブラウザ実測を根拠とする完了報告

「実ブラウザ実測」の条件は、ブラウザ実行系の有無ではなく **検証基準と同一の描画環境** である。ブラウザが起動できることだけを根拠にこの禁止を解除してはならない。

2026-08-21 実測：クラウドの既定イメージに `google-chrome` は無く、Playwright同梱のChromiumが `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` にある。`CHROME_PATH` を指定すれば `templates/verify/cdp-browser.mjs` から起動できるが、**それだけでは条件を満たさない**。同一環境と認めるには、対象デザインが要求するフォントがコンテナに導入されていることを実測で確認し、使用したブラウザのバージョンを記録することが必要である。フォントが異なればテキストの折り返し・行高・外接寸法が変わり、Figmaとの差は測定誤差ではなく別物になる。Playwright同梱のChromiumはイメージ更新でバージョンが変わるため、暗黙に依存してはならない。

描画環境に依存しない検査（ページが読み込めるか、スクリプトが動くか、DOM構造の検査）はこの禁止の対象外とする。

差し戻すときは、「クラウドでは判断できない項目」を列挙し、ローカルで再開すべき手順を書いて終える。**上位層を読めないまま推測で埋めてはならない。**読めなかった層を読んだことにして完了報告することは、この規則の最も重大な違反とする。

Figma URL付きの実装・修正では、Figma実物・spec・DOM対応表・実ブラウザ実測が揃うまで推測で編集しない。Figma照合はコーディング反復内で行い、Git hook、commit、push、deployでは実行しない。

Figmaの実装・修正scopeでは、編集前に D-012スコープロックとして `rules/figma-scope-lock.md` のscope manifestを開始する。visual・componentの修正scopeに、共通ルール、検証ツール、LOOP仕様、ログ昇格の変更を混ぜてはならない。これらはオーナーが明示した別scopeだけで扱う。

## 対象nodeの同定ゲート

ソースを編集する前に、オーナーが示したDOMとFigma nodeを次の全項目で照合し、案件側の対応表へ記録する。

1. 対象DOMのセレクター、親要素、ページ内の前後セクション、配置順
2. PC/SPそれぞれのFigma fileKey・node-id・座標・外接寸法
3. 直前・直後のFigmaセクション、および見出し・本文・ロゴ・CTA・注記などの主要構成

Figma上で同じ表示名のノード、同種CTA、同じ文言のボタンが複数ある場合、名称・文言・過去scopeのnode-idだけを根拠に選んではならない。提示DOMの前後関係と主要構成が一致しない候補は対象外とする。PC/SPのいずれかで一致しない、または候補が一意に定まらない場合は、実装・画像書き出し・比較画像登録を開始せず、オーナーへ不足情報を一つだけ確認する。

過去の対応表、比較画像、gate manifestは、今回のDOM位置とFigmaの前後関係を再照合してからだけ再利用できる。照合されていない既存記録は根拠にしてはならない。

## Figma差異指摘の保存先

- レイアウトがFigmaと異なるという指摘を受けたら、最初に案件側 `MyBrain/rules/corrections.md` へ対象URL、Figma node-id、対象DOM/CSS、期待値、実測差分、原因、再発防止を記録する。
- 同じ指摘から案件横断の工程失敗が判明した場合だけ、プロジェクト固有値を除いた抽象ルールを `rules/corrections.md` または `rules/mistakes.md` へ昇格する。
- `C:\AI\figma-to-code` には案件名、URL、node-id、セレクタ、数値、固有アセットを保存しない。案件固有の記録を共通ルールで代用しない。
- 案件横断のFigma失敗は手書き追記せず、`templates/figma-log-record.json` を埋めて `node tools/figma-log-promote.mjs record rules/log-promotion-policy.json <record.json> learning/log-promotions` を実行する。再発proposalは負のE2E、独立レビュー、オーナー承認まで `pending-review` とする。承認済み差分だけは `rules/correction-log-promotion.md` の `review` / `apply` 契約で昇格し、通常scopeから正本を自動変更しない。

## この手法自体を編集する場合

1. `LOOP.md` と `STATE.md` を読む。
2. `spec/QUESTIONS.md` の未回答または差し戻し設問を1件だけ扱う。
3. 仕様の起草・独立批評・STATE記録を分離する。
4. 案件固有の値・URL・認証情報をこのフォルダに書かない。
