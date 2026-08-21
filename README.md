# figma-to-code — Figmaから正確にコーディングする方法

`C:\AI\figma-to-code` は、Figmaデザインをコードへ実装するための**唯一の正本**です。Figma固有の規則、テンプレート、検証キット、レビュー基準、再発防止履歴はこのフォルダに置きます。

共通Vault（`C:\AI\vault`）は全作業に共通する憲法・判断基準・恒久ルールだけを扱います。Web実装タスクでは共通Vaultの後に `C:\AI\web-development` を読み、Figma実装タスクではさらにこのフォルダを読みます。

## 実行時の入口

どちらのエージェントも、入口ファイルを読んだ直後の最初のツール実行で `node tools/workflow-preflight.mjs` を実行する。これによりCodexクラウドをClaude専用の環境変数だけで誤ってローカル扱いする経路と、上位規則が欠けたまま実装を始める経路を閉じる。

### Codex
1. `C:\Users\tane1\.codex\AGENTS.md`
2. `C:\AI\vault\AGENTS.md`
3. `C:\AI\web-development\AGENTS.md`
4. `AGENTS.md`

### Claude
1. `C:\Users\tane1\.claude\CLAUDE.md`
2. `C:\AI\vault\CLAUDE.md`
3. `C:\AI\web-development\CLAUDE.md`
4. `CLAUDE.md`

その後、共通で `rules/figma-spec-pipeline.md`、`rules/figma-mcp-implementation.md`、`rules/figma-image-export.md`、`rules/loop-execution.md`、`rules/self-improvement.md`、`rules/correction-log-promotion.md`、必要な `templates/` と案件側 `MyBrain/` を読む。

## 構成

- `rules/`：Figma固有の実装規則と再発防止履歴
- `templates/`：案件へ導入する LOOP と検証キット
- `tools/`：案件横断の訂正ログをLoop Engineering提案へ変換する実行器
- `references/`：Figmaレビュー基準などの参照資料
- `spec/`：この手法そのものを育成する仕様
- `LOOP.md` / `STATE.md`：手法育成ループの状態

## Gitとの関係

Figma照合はコーディング反復の中で実施する。Git hook、commit、push、deployに結び付けない。

## 状態

- 版: 0.3.1（D-010起草を含む）
- 最終更新: 2026-07-18
