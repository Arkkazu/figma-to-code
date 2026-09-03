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

**Figmaをデザイン根拠とする実装・修正・再現・コーディングの依頼**を受けたら、次の5点を報告するまで**ソースを1行も編集しない**。入口（`AGENTS.md` / `CLAUDE.md`）はこの節を指すだけで、内容を複製しない。

**発火条件はFigma URLの有無ではなく依頼の意図で判定する。**「Figmaデザインを実装して」「Figmaどおりにコーディングして」「このFigmaを再現して」「デザインどおりに直して」「デザインと違う」、およびFigmaで設計された画面・コンポーネントの新規実装・見た目の修正は、URLが会話に出ていなくてもすべてこの節の対象である。判断に迷う依頼は実行する側に倒す。`start` はゲートではなく編集を許可しないため、実行しても失うものはない。

> [!important] 狭い発火条件が実害を出した（2026-08-29）
> 旧文は「Figma URLや『デザインどおりに直して』という依頼」と書いており、新規実装で普通に使う
> 「Figmaデザインを実装して」「Figmaどおりにコーディングして」が明示されていなかった。
> 規則・spec・ゲート・検証器がすべて設置済みの案件で、依頼文の表現によってFigma作業として
> 処理されず、取得・実測・ゲートを経ないままコード編集へ進む経路が残っていた。

発火条件は入口（`AGENTS.md` / `CLAUDE.md`）、`templates/project-entry.md`、本ファイル、`C:\AI\web-development\WORKFLOW.md` の5箇所にある。入口は規則本文を複製しないが、**発火条件は「どの規則へ入るか」の経路情報であり入口の責務**なので削除しない。複製が危険なのは乖離が黙って起きるときだけなので、削除する代わりに乖離を機械で落とす。`rules/` か入口を触ったら実行してPASSさせる。

```bash
node C:/AI/figma-to-code/tools/entry-trigger-audit.mjs
```

検査するのは**契約要素**であって特定の文言ではない。落とすのは「狭窄（URLがあるときだけ、という書き方）」「URL非依存の宣言が無い」「迷ったらゲートへ倒す既定が無い」「例示が0件」の4つだけで、**例示の逐語一致は要求しない**（既定があるので列挙は網羅でなくてよい）。受理する言い回しの正本は `verify-config/entry-trigger-contract.json` にある。**文言を書き直して落ちたら、コードではなくこのファイルへ言い回しを1行足す。**要素そのものを消したときだけ書き戻す。

工程と停止条件は暗記で再生しない。着手時に出力させる。

```bash
npm run figma:gate -- start
```

報告した5点は `MyBrain/verify/start-<scope-id>.json`（着手宣言）へ記録し、gate manifestの `scope.startDeclarationPath` へ登録する。`preflight` が内容をmanifestと突き合わせて凍結する。詳細は `rules/figma-spec-pipeline.md`「着手時の工程出力と着手宣言の受領証」。

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

## 検証器の配布（2026-08-26追加）

`templates/verify/` から案件の `MyBrain/verify/` へ検証器を配るときは、**必ず配布ツールを使う**。
`cp` で直接配らない。

```bash
node C:/AI/figma-to-code/tools/verifier-distribute.mjs <案件のMyBrain/verifyディレクトリ>
node C:/AI/figma-to-code/tools/verifier-distribute.mjs <dir> --check          # 判定だけ
node C:/AI/figma-to-code/tools/verifier-distribute.mjs <dir> <file> --allow-dirty --reason "<20文字以上>"
```

このツールは次を強制する。素の `cp` で配って案件のゲートを2回全面停止させたため
（`rules/mistakes.md` 2026-08-26）、手順ではなく機械で塞ぐ。

1. **未コミット変更を持つファイルは配布しない。** 正本リポジトリの作業ツリーは「正本の最新」ではなく、
   他セッションの進行中作業が混ざっていることがある。配るなら `git show HEAD:<path>` を土台に、
   配りたい変更だけを再適用したものを配る。
2. **上書き前に退避を取る。** 案件側 `MyBrain/` はgit管理外で、上書きすると復元できない。
3. **配布後に案件側の e2e を実行し、失敗したら自動で巻き戻す。**
   2回の事故はどちらも e2e を回して初めて破壊に気づいた。回さなければ気づけない。
4. 未コミットのまま配る判断をしたときは `--allow-dirty --reason` で理由を残す。

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

Figmaをデザイン根拠とする実装・修正では、Figma実物・spec・DOM対応表・実ブラウザ実測が揃うまで推測で編集しない。Figma照合はコーディング反復内で行い、Git hook、commit、push、deployでは実行しない。

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
- **手順書の上限**：`rules/` の手順書（蓄積ログでないもの。`figma-spec-pipeline.md` など開始順4の必読）は **600行 / 80KB** を上限とする。手順は一部だけ読んでも役に立たないため、退避はしない。上限に達したら、同じ工程を扱う節を**統合**して縮める。新しい注意点は既存の該当節へ書き足し、`（YYYY-MM-DD追加）` の新節を積み増さない。2026-08-26 実測：`figma-spec-pipeline.md` 523行 / 72.9KB（上限内だが余裕は少ない）。
- **蓄積ファイルの上限**：`rules/corrections.md` と `rules/mistakes.md` は `<!-- loop-log-schema: v1 -->` を境に、前が機械管理領域、後が legacy領域である。
  - **機械管理領域には件数上限を置かない。**`figma-log-promote` の再発判定（`recurrenceKey` の件数）が既存記録を数えるため、退避すると3回目の再発が1回目に見える。サイズは再発検出の対価として受け入れる。この2ファイルは開始順4の必読には含まれない（記録・昇格のときに読む）。
  - **legacy領域は10件を上限**とし、超えたら日付の古い順に `rules/corrections-archive.md` / `rules/mistakes-archive.md` へ退避する。marker より後の記録は再発判定の対象外なので、退避しても検出は劣化しない。
  - 追記は `figma-log-promote` が行い、**機械管理領域の先頭**（最新を上に）へ入れる。手書きで末尾へ足さない。
  - **上限は機械で確かめる。**散文の上限は守られない。`rules/` を触ったら次を実行してPASSさせる。

```bash
node C:/AI/web-development/verify/rule-size-audit.mjs verify-config/rule-size-audit.config.json
```
- 案件横断のFigma失敗は手書き追記せず、`templates/figma-log-record.json` を埋めて `node tools/figma-log-promote.mjs record rules/log-promotion-policy.json <record.json> learning/log-promotions` を実行する。再発proposalは負のE2E、独立レビュー、オーナー承認まで `pending-review` とする。承認済み差分だけは `rules/correction-log-promotion.md` の `review` / `apply` 契約で昇格し、通常scopeから正本を自動変更しない。

## 検査と反映

このリポジトリへの変更は `node tools/run-checks.mjs` を通してから push する。**検査集合の正本は `tools/run-checks.mjs` の `CHECKS` だけ**とし、CIのYAMLへ検査を直接並べない（2箇所に書くと必ず乖離する）。

GitHub Actions は2つある。

- `.github/workflows/verify-and-merge.yml`：`claude/**` と `codex/**` への push で `run-checks.mjs` を実行し、緑なら `master` へ自動マージする。赤ならマージしない。
- `.github/workflows/audit.yml`：**すべてのブランチ**への push と pull request で同じ `run-checks.mjs` を実行する。自動マージはしない。`fix/**` など上記2つに当たらないブランチが未検査のまま残る穴を塞ぐ。

実ブラウザや案件側の成果物を要するE2Eは `run-checks.mjs` の `KNOWN_FAILING` に理由つきで外してある。緑と赤を混ぜた集合は「いつも赤いので誰も見ない」状態を作り、検査そのものを無効化する。解消したら `CHECKS` へ移す。

自動マージは検査に通ることだけを保証する。**設計判断の妥当性は保証しない**ので、規則本文（`WORKFLOW.md`・`rules/`）の意味を変える変更は、オーナーの指示があったものに限る。

**ローカルのGit hookはcloneに残らない。**案件テーマの pre-commit は `.git/hooks/` にだけ在り、`core.hooksPath` は未設定で追跡下にも無い。クラウドセッションはhookもCIも無い状態で clone するため、CIが無いと検査を通らない変更が正本へ入る。

CI runner には上位層（`C:\AIault` / `C:\AI\web-development`）が無く、「クラウドセッションでの実行範囲」と同じ `cloud-restricted` 条件で動く。そのため次の2点は**CIでは検査されない**。CIが緑でも未検査なので、ローカルで通してから push する。

- `rule-size-audit`（上位層に在るため実行不能）
- 入口の発火条件のうち `C:\AI\web-development\WORKFLOW.md` の1文書（`entry-trigger-audit.e2e` は上位層を読めない環境では4文書だけを検査する。読めるのに skip して通す取り違えは、同じE2Eが落とす）

```bash
node C:/AI/web-development/verify/rule-size-audit.mjs verify-config/rule-size-audit.config.json
node C:/AI/figma-to-code/tools/entry-trigger-audit.mjs
```

branch protection と required check は**まだ有効化していない**。有効化するまでCIは「落ちたことが見える」だけで、mergeを止めない。有効化はリポジトリ設定の変更であり、オーナーの判断事項である。

## この手法自体を編集する場合

1. `LOOP.md` と `STATE.md` を読む。
2. `spec/QUESTIONS.md` の未回答または差し戻し設問を1件だけ扱う。
3. 仕様の起草・独立批評・STATE記録を分離する。
4. 案件固有の値・URL・認証情報をこのフォルダに書かない。
