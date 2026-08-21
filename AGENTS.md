# figma-to-code 入口

規則本文はこのリポジトリ直下の `WORKFLOW.md` のみです。この入口に規則本文を複製しません。

**最初のツール実行**で環境判定を実行し、その判定に従ってください。cwdに依存しない絶対パスで呼びます。

```bash
node C:/AI/figma-to-code/tools/workflow-preflight.mjs
```

非0終了、またはJSON判定が得られない場合は着手しないでください。`cloud-restricted` のときは、上位層を探して推測で補完せず、`WORKFLOW.md`「クラウドセッションでの実行範囲」に従ってください。

Figma URLや「デザインどおりに直して」という依頼では、`WORKFLOW.md`「着手前ゲート」の5点を報告するまで**ソースを1行も編集しません**。
