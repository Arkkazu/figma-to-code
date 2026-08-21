# figma-to-code 入口

規則本文はこのリポジトリ直下の `WORKFLOW.md` のみです。**最初のツール実行で** `node tools/workflow-preflight.mjs` を実行し、その判定に従ってください。ローカル判定なら共通VaultとWeb Developmentの `WORKFLOW.md` を完了してから本リポジトリの規則を読み、同じFigma実装・検証手順を実行してください。

ローカル環境での上位層の位置は次のとおりです。

- 共通Vault：`C:\AI\vault\WORKFLOW.md`
- Web Development：`C:\AI\web-development\WORKFLOW.md`

**Claude Code / Codex のクラウドセッションではこの2つが存在しません。**preflight が `cloud-restricted` を返した場合は、上位層を探して推測で補完せず、`WORKFLOW.md` の「クラウドセッションでの実行範囲」に従ってください。preflight が失敗した場合は作業を開始してはいけません。

この入口ファイルには規則本文を複製しません。
