# figma-to-code — Figmaから正確にコーディングする方法

`C:\AI\figma-to-code` は、Figmaデザインをコードへ実装するための**唯一の正本**です。Figma固有の規則、テンプレート、検証キット、レビュー基準、再発防止履歴はこのフォルダに置きます。

共通Vault（`C:\AI\vault`）は全作業に共通する憲法・判断基準・恒久ルールだけを扱います。Web実装タスクでは共通Vaultの後に `C:\AI\web-development` を読み、Figma実装タスクではさらにこのフォルダを読みます。

## 実行時の入口

どちらのエージェントも、入口ファイルを読んだ直後の最初のツール実行で環境判定を実行する。cwdに依存しないよう絶対パスで呼ぶ。

```bash
node C:/AI/figma-to-code/tools/workflow-preflight.mjs
```

これによりCodexクラウドをClaude専用の環境変数だけで誤ってローカル扱いする経路と、上位規則が欠けたまま実装を始める経路を閉じる。Figma実装scopeでソースを編集する前は `--assert-local` を付けて非0終了で止まることを確認する。この環境判定は編集前ゲート `figma:gate preflight` とは別物で、両方を通す。

案件側のうち、エージェントのcwdになりうるディレクトリ（リポジトリのルート、テーマディレクトリなど）には、`templates/project-entry.md` から生成した入口2枚を置く。Codexは cwd の祖先しか自動読込しないため、置かない限り本リポジトリの規則は案件セッションに届かない。

```bash
node C:/AI/figma-to-code/tools/project-entry-install.mjs <ディレクトリ> [<ディレクトリ> ...] --check
```

### Codex
1. 案件側の `AGENTS.md`（`project-entry-install.mjs` が設置）
2. `C:\Users\tane1\.codex\AGENTS.md`
3. `C:\AI\vault\AGENTS.md`
4. `C:\AI\web-development\AGENTS.md`
5. `C:\AI\figma-to-code\AGENTS.md`

### Claude
1. 案件側の `CLAUDE.md`（`project-entry-install.mjs` が設置）
2. `C:\Users\tane1\.claude\CLAUDE.md`
3. `C:\AI\vault\CLAUDE.md`
4. `C:\AI\web-development\CLAUDE.md`
5. `C:\AI\figma-to-code\CLAUDE.md`

その後、共通で `rules/figma-spec-pipeline.md`、`rules/figma-scope-lock.md`、`rules/figma-mcp-implementation.md`、`rules/figma-image-export.md`、`rules/loop-execution.md`、`rules/self-improvement.md`、`rules/correction-log-promotion.md`、必要な `templates/` と案件側 `MyBrain/` を読む。

## 構成

- `rules/`：Figma固有の実装規則と再発防止履歴
- `templates/`：案件へ導入する LOOP と検証キット
- `tools/`：環境判定・案件入口の設置・訂正ログ昇格の実行器
- `references/`：Figmaレビュー基準などの参照資料
- `spec/`：この手法そのものを育成する仕様
- `MyBrain/`：本リポジトリを改善するための公開メモリ（案件側の非公開 `MyBrain/` とは別物）
- `LOOP.md` / `STATE.md`：手法育成ループの状態

## Gitとの関係

Figma照合はコーディング反復の中で実施する。Git hook、commit、push、deployに結び付けない。

## 状態

- 版: 0.3.2（D-010起草、環境判定 `workflow-preflight` を含む）
- 最終更新: 2026-08-22
