# Codex 編集前フック

既存 `figma-scope-lock assert` と `figma-gate assert-edit` を、同期 `PreToolUse` へ接続する運用手順です。工程の規則本文は `../WORKFLOW.md` にあります。

## 実装した範囲

- `apply_patch` の追加・更新・削除・移動先を検査し、hookイベントのsession IDに束縛したactive scopeだけを許可します。相対パスはイベントcwd基準です。
- 案件では実preflight、同一session/context、同一scope lock、凍結済み入力・検証器ハッシュ、changeTargetsとの一致が必要です。`assert-edit` は読み取り専用で、preflightの再実行やbrowser測定はしません。
- 本プレイブックの保守だけはFigma証跡を作らず、scope lockで検査します。案件でこの分岐を選ぶことはできません。
- 設定・scope制御ファイル・検証器の直接編集、範囲外パス、symlink/junction/hardlink、パス別名を拒否します。
- 任意shell、MCP、未知のツールは拒否します。許可するshellは固定readerだけです。**ビルド・テスト・preflight・配布・Git操作はオーナーの通常端末で実行します。**一般的なCodexの自律開発をそのまま維持する構成ではありません。

## 設置と有効化

次はオーナーの通常端末で実行します。`<playbook>` はこのリポジトリ、`<repo>` は導入先の絶対パスです。他案件へは自動配布しません。

```text
node <playbook>/tools/codex-edit-guard.mjs install <repo>
```

`.codex/hooks.json` を生成します。既存設定が異なる場合は上書きせず停止します。設定には導入環境の絶対パスを入れますが、生成物はGitへ追加しません。GitHubのcloneだけでは有効にならないため、各環境で設置してください。

Codex側でプロジェクトと**そのフック定義そのもの**を信頼する必要があります。対応クライアントの `/hooks` で内容を閲覧して信頼してください。インストーラーは信頼を自動付与しません。既存の永続shellを残さず、新しいセッションから始めます。

未束縛の状態で編集を要求し、実際の拒否と対象bytes不変を検査します。拒否理由のsession IDをそのまま使います。自己申告のactor名を実行環境のsession IDの代わりにしてはいけません。

## scopeとの接続

承認された正確なファイル集合を持つscope manifestを準備し、既存の `figma-scope-lock begin` を実行します。案件では既存の着手前ゲートを実行し、preflightの `--implementation-context-id` に実hookのsession IDを指定します。承認やFigma証跡をこのツールが生成することはありません。

```text
node <playbook>/tools/figma-scope-lock.mjs begin <scope-manifest> <scope-state>
node <playbook>/tools/codex-edit-guard.mjs bind <repo> <session-id> <scope-state> <figma-manifest>
```

本プレイブック保守の `bind` では末尾の `<figma-manifest>` を省略します。本プレイブックの公開MyBrainへ案件用gateや証跡を作ってはいけません。scopeファイルは承認された保守作業の制御ファイルとして別途配置します。

`bind` はbegin時点のmanifest hash、scope ID、allowedPaths、controlPathsを記録します。案件ではmanifestが同じscope lockを参照し、全allowedPathsがgateのchangeTargetsに含まれることも検査します。これは運用担当者が選択したscopeとの接続であり、オーナー本人の認証・署名の証明ではありません。

同じセッションで別作業へ移る場合や承認済みamend後は、通常端末から既存束縛を退役して接続し直します。退役した束縛は履歴として保持されます。scopeのblocked状態を解除する操作ではありません。

```text
node <playbook>/tools/codex-edit-guard.mjs unbind <repo> <session-id>
```

フック・検証器自身の更新は、guardが有効な作業セッションからは行いません。オーナー管理の保守端末で変更・試験を行います。

## 固定reader

```text
node <playbook>/tools/codex-edit-guard.mjs read-command read <relative-file>
node <playbook>/tools/codex-edit-guard.mjs read-command list .
```

出力されたcommand文字列を変更せず使用します。shell入力は `login:false`、TTYなし、独自shell・環境変数・権限上書きなしに限定します。対応していないクライアントではこの経路も拒否されます。readerはリポジトリ内のファイル読出し・ディレクトリ列挙のみで、任意JavaScriptを実行しません。

## 試験と限界

```text
node tools/codex-edit-guard.e2e.mjs
node templates/verify/figma-gate.e2e.mjs
node tools/run-checks.mjs
```

単体試験はhookプロトコルの再生、実検証器接続試験は使い捨てGitリポジトリで実CLIを起動します。負の試験が本当に効くことは、束縛検査を除去した変異版に**同じ試験**を当て、不合格になることで検査します。実Codexによる発火・信頼・ツールdispatchは別の実機試験です。

この機構は**補助的な防止策であり、OSの書き込み権限境界ではありません**。特に次は解消していません。

- 未信頼・未ロードのhookは実行されません。スクリプト不在、Node不在、外側のhook起動失敗・timeoutを、スクリプト自身で必ず拒否へ変換することはできません。
- 既に動いているshellへの `write_stdin` は再度hookされない経路があります。hook対象外の専用ツールや別プロセス、設定を変更できる利用者も本機構の外側です。
- 実行環境のPATH、shell、Node設定、guardのコード自体は信頼対象です。ファイル検査と実書き込み間の競合をOSレベルで封じてはいません。
- 実装中のFigma品質や完了報告の真偽までは保証しません。既存checkpoint・close・releaseの検査を省略できるという意味ではありません。

これらまで閉じるには、エージェントをread-onlyにし、外部の信頼済み実行器だけに書き込み権限を渡す追加設計が必要です。今回その権限分離やGitHub保護設定は変更していません。

仕様根拠: [OpenAI Hooks documentation](https://learn.chatgpt.com/docs/hooks)。同期PreToolUseの `permissionDecision: deny` を使用します。未対応の `continue:false` や `permissionDecision:ask` は使用しません。設置済みというだけでは「迂回不能」「稼働確認済み」と報告しません。
