# 案件エントリ — Figma実装は figma-to-code の規則で行う

このファイルは `C:\AI\figma-to-code\templates\project-entry.md` の複製です。案件リポジトリのルートに `AGENTS.md` と `CLAUDE.md` の2枚として置き、Codex / Claude の祖先ディレクトリ自動読込に乗せます。**直接編集しない。**正本を直してから再インストールします。

```bash
node C:\AI\figma-to-code\tools\project-entry-install.mjs <案件ルート>          # 設置・更新
node C:\AI\figma-to-code\tools\project-entry-install.mjs <案件ルート> --check  # 世代差の検出（非0で失敗）
```

## 最初のツール実行

この案件でFigma実装・修正を依頼されたら、他の調査・編集より先に環境判定を実行します。cwdに依存しない絶対パスで呼びます。

```bash
node C:\AI\figma-to-code\tools\workflow-preflight.mjs
```

`local` なら `C:\AI\figma-to-code\WORKFLOW.md` の開始順に従って上位層から読みます。非0終了、またはJSON判定が得られない場合は着手してはいけません。推測で上位層を補完しないでください。

## 着手前ゲート（規則本文を読む前でも例外なく適用）

Figma URLや「デザインどおりに直して」という依頼を受けたら、次の5点を報告するまで**ソースを1行も編集しません**。

1. 環境判定 `workflow-preflight` の結果（`local` / `cloud-restricted`）
2. 対象のFigma fileKey と、PC/SP それぞれの node-id
3. spec（期待値と取得元）とFigma↔DOM対応表の所在。取得していない値を推測で埋めていないこと
4. D-012スコープロック（`C:\AI\figma-to-code\rules\figma-scope-lock.md`）の開始と、今回のscope外パス
5. `node C:\AI\figma-to-code\tools\workflow-preflight.mjs --assert-local` が exit 0、かつ編集前ゲートが cleanな作業ツリーでPASSしたこと

```bash
npm run figma:gate -- preflight MyBrain/verify/gate-<対象>.json --implementation-actor <actor> --implementation-context-id <context>
```

環境判定と `figma:gate preflight` は別物です。前者のPASSは後者の代わりになりません。`figma:gate` script が未導入なら、ゲート未導入として実装を開始せず、導入手順の確認だけを行います。いずれかが未了なら推測で補わず、不足情報を1つだけ確認して停止します。

## 規則と記録の所在

- Figma実装規則の正本：`C:\AI\figma-to-code\WORKFLOW.md`（この案件エントリに規則本文は複製しません）
- 検証キットの正本：`C:\AI\figma-to-code\templates\verify\`（案件側 `MyBrain/verify/` はその複製）
- 案件固有の差異指摘・訂正：案件側 `MyBrain/rules/corrections.md`
- 案件横断の失敗：`C:\AI\figma-to-code` 側へ `figma-log-promote.mjs record` で登録する。手書きで正本へ追記しない
