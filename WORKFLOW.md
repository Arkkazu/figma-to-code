# WORKFLOW.md — figma-to-code の唯一の実行規則

`C:\AI\figma-to-code` はFigma固有の規則・テンプレート・履歴の唯一の正本です。共通Vaultは上位の汎用原則、`C:\AI\web-development` はWeb実装の正本として先に読む。規則本文をエージェント別の入口へ複製しない。

## Figma実装・修正タスクの開始順

入口（`AGENTS.md` / `CLAUDE.md`）を読んだ直後、他の調査・編集より先に環境判定 `workflow-preflight` を実行する。案件ディレクトリなど本リポジトリ外で作業している場合も同じなので、**cwdに依存しない絶対パスで呼ぶ**。

```bash
node C:/AI/figma-to-code/tools/workflow-preflight.mjs
```

`local` なら下記1〜6を順に読み、`cloud-restricted` なら次節の制限に従う。非0終了、またはJSON判定が得られない場合は着手しない。

本ファイルで `workflow-preflight` と呼ぶものは**環境判定**であり、`rules/figma-spec-pipeline.md` の編集前ゲート `figma:gate preflight` とは別物である。環境判定のPASSは編集前ゲートの代わりにならない。両方を通す。

1. `C:\AI\vault\WORKFLOW.md`
2. `C:\AI\web-development\WORKFLOW.md`
3. 本ファイルと `README.md`
4. `rules/figma-spec-pipeline.md`、`rules/figma-scope-lock.md`、`rules/figma-mcp-implementation.md`、`rules/figma-image-export.md`、`rules/loop-execution.md`、`rules/self-improvement.md`、`rules/correction-log-promotion.md`
5. 本リポジトリの規則・テンプレート・tools・workflowを改善する場合は、リポジトリ直下の `MyBrain/README.md`、`MyBrain/STATE.md`、`MyBrain/rules/`
6. 案件のFigma実装・修正を行う場合は、案件側 `MyBrain/README.md`、`MyBrain/WORKFLOW.md`、`MyBrain/rules/`、案件側 `LOOP.md` / `STATE.md`

`rules/`・`templates/`・本ファイルに書かれた `MyBrain/verify/…`、`MyBrain/rules/corrections.md` などのパスは、**すべて6の案件側 `MyBrain/` を指す**。5のリポジトリ直下 `MyBrain/` は本リポジトリを改善するための公開メモリであり、検証キットもgate manifestも置かない。同名だが別物として扱う。

## 着手前ゲート

Figma URLや「デザインどおりに直して」という依頼を受けたら、次の5点を報告するまで**ソースを1行も編集しない**。入口（`AGENTS.md` / `CLAUDE.md`）はこの節を指すだけで、内容を複製しない。

1. 環境判定 `workflow-preflight` の結果（`local` / `cloud-restricted`）
2. 対象のFigma fileKey と、PC/SP それぞれの node-id（同定は「対象nodeの同定ゲート」に従う）
3. spec（期待値と取得元）とFigma↔DOM対応表の所在。取得していない値を推測で埋めていないこと
4. D-012スコープロック（`rules/figma-scope-lock.md`）の開始と、今回のscope外パス
5. 次の2つがどちらも通ったこと。環境判定は編集前ゲートの代わりにならない。

```bash
node C:/AI/figma-to-code/tools/workflow-preflight.mjs --assert-local
npm run figma:gate -- preflight MyBrain/verify/gate-<対象>.json --implementation-actor <actor> --implementation-context-id <context>
```

いずれかが未了なら、推測で補わず、不足情報を1つだけ確認して停止する。案件側で `figma:gate` script が未導入なら、ゲート未導入として実装を開始せず、導入手順の確認だけを行う。

## 案件側への入口の設置

Codexが自動読込するのは cwd とその祖先の `AGENTS.md`、およびグローバル `~/.codex/AGENTS.md` だけである。`C:\AI\figma-to-code` は案件の作業ディレクトリの祖先ではないため、**案件側に入口を置かない限り、この規則は案件セッションに届かない。**雛形の正本は `templates/project-entry.md` とし、手作業でコピーしない。

置き場所は「エージェントのcwdになりうるディレクトリ」であり、リポジトリのルートとは限らない。テーマディレクトリ配下で作業する案件では、そのディレクトリにも同一内容を置く（祖先チェーンは cwd から上へしか辿らないため、深い階層だけに置くと上位で起動したセッションに届かず、浅い階層だけに置くと深い階層で起動したセッションに届く一方で案件側の記述と二重管理になる）。

```bash
node C:/AI/figma-to-code/tools/project-entry-install.mjs <ディレクトリ> [<ディレクトリ> ...]          # AGENTS.md と CLAUDE.md を設置・更新
node C:/AI/figma-to-code/tools/project-entry-install.mjs <ディレクトリ> [<ディレクトリ> ...] --check  # 世代差の検出（不一致は非0終了）
```

`--check` は雛形とのSHA-256一致を検査する。案件側の入口を手編集しない。案件固有の記録は案件側 `MyBrain/` に置く。入口が未設置または世代差のある案件では、Figma実装を開始する前に設置し直す。

**案件側 `MyBrain/WORKFLOW.md` は最下層（開始順の5）であり、上位層1〜4を置き換えない。**案件の入口が案件層だけを指している場合、上位層へ到達するかは案件側ファイルの記述しだいで、本リポジトリからは検証できない。読む順序は入口自身に持たせる。

規範文書に書くコマンドは、`node tools/doc-command-audit.mjs` で「書いてあるとおり実行して通る形か」を検査する。案件側は正本の記述を写すため、正本が実行できない形を書いていると案件で落ち、ゲートを飛ばす経路が開く。検査は2つ。

- ゲート起動が実引数契約（`--implementation-actor` / `--implementation-context-id`）と一致していること
- `node` / `npm` のコマンド行がWindowsのバックスラッシュ絶対パスを使っていないこと。**Git Bashはバックスラッシュをエスケープとして食う**ため、絶対パスは `C:/AI/figma-to-code/...` と書く。散文中の所在表記（`C:\AI\vault\WORKFLOW.md` など）はこの制約の対象外とする。

## クラウドセッションでの実行範囲

Claude Code / Codex のクラウドセッションは、このリポジトリのクローンだけを持つ。上の開始順のうち **1（共通Vault）、2（Web Development）、6（案件側 `MyBrain/`）は存在しない**。リポジトリ直下の `MyBrain/` はクローンに含まれるため、本リポジトリを改善する作業では5も読む。ユーザースコープのMCP設定は届かない。

クラウド判定の正本は `tools/workflow-preflight.mjs` が**上位層の `WORKFLOW.md` を実際に読めるか**とする。読めない、下限バイト未満、Markdown見出しが無い（空・プレースホルダ）の場合は `cloud-restricted` とする。`CLAUDE_CODE_REMOTE=true` と `CODEX_CI=1` は補助シグナルであり、特定エージェントだけの環境変数を唯一の判定条件にしてはならない。

2026-08-22 実測（オーナー環境、Git Bash）：`local` を返し、`C:\AI\vault\WORKFLOW.md` と `C:\AI\web-development\WORKFLOW.md` はどちらも `status: ok`。ローカルの上位層は既定パスのまま読める。

2026-08-21 実測：Claude Codeのクラウドセッションは `CLAUDE_CODE_REMOTE=true` を持ち、上位層2ファイルはどちらも存在しない。`CODEX_CI=1` はCodexクラウドの申告値であり、本リポジトリでは未実測である。判定はファイルの実読を正本とするため、この値の当否に結果が依存しない構成にしてある。

上位層のルート位置が既定と異なるローカル環境では、`FIGMA_TO_CODE_VAULT_WORKFLOW` と `FIGMA_TO_CODE_WEB_DEVELOPMENT_WORKFLOW` でパスを上書きする。ファイル検査は空・プレースホルダを弾くが、**旧世代のコピーは検出できない**。世代差の検査はこの環境判定の責務ではない。

Figma実装・修正でソースを編集する前は、環境判定を非0で落ちないことまで確認する（`cloud-restricted` は exit 2）。

```bash
node C:/AI/figma-to-code/tools/workflow-preflight.mjs --assert-local
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
