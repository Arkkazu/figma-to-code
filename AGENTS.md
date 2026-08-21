# figma-to-code 入口

規則本文はこのリポジトリ直下の `WORKFLOW.md` のみです。**最初のツール実行で**次の環境判定を実行し、その判定に従ってください。案件ディレクトリで作業している場合も同じなので、cwdに依存しない絶対パスで呼びます。

```bash
node C:\AI\figma-to-code\tools\workflow-preflight.mjs
```

`local` なら共通VaultとWeb Developmentの `WORKFLOW.md` を完了してから本リポジトリの規則を読み、同じFigma実装・検証手順を実行してください。非0終了、またはJSON判定が得られない場合は着手してはいけません。

## 着手前ゲート（規則本文を読む前でも例外なく適用）

Figma URLや「デザインどおりに直して」という依頼を受けたら、次の5点を報告するまで**ソースを1行も編集しません**。

1. 環境判定 `workflow-preflight` の結果（`local` / `cloud-restricted`）
2. 対象のFigma fileKey と、PC/SP それぞれの node-id
3. spec（期待値と取得元）とFigma↔DOM対応表の所在。取得していない値を推測で埋めていないこと
4. D-012スコープロック（`rules/figma-scope-lock.md`）の開始と、今回のscope外パス
5. `node C:\AI\figma-to-code\tools\workflow-preflight.mjs --assert-local` が exit 0、かつ編集前ゲート `figma:gate preflight` がcleanな作業ツリーでPASSしたこと

環境判定と `figma:gate preflight` は別物です。前者のPASSは後者の代わりになりません。いずれかが未了なら推測で補わず、不足情報を1つだけ確認して停止します。

ローカル環境での上位層の位置は次のとおりです。

- 共通Vault：`C:\AI\vault\WORKFLOW.md`
- Web Development：`C:\AI\web-development\WORKFLOW.md`

**Claude Code / Codex のクラウドセッションではこの2つが存在しません。**環境判定が `cloud-restricted` を返した場合は、上位層を探して推測で補完せず、`WORKFLOW.md` の「クラウドセッションでの実行範囲」に従ってください。

この入口ファイルには、上の着手前ゲート以外の規則本文を複製しません。
