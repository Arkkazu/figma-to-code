# 案件エントリ — Figma実装は figma-to-code の規則に従う

このファイルは `C:\AI\figma-to-code\templates\project-entry.md` の複製です。**直接編集せず**、正本を直してから再インストールします。規則本文はここに複製しません。

**最初のツール実行**で環境判定を実行します。cwdに依存しない絶対パスで呼びます。

```bash
node C:/AI/figma-to-code/tools/workflow-preflight.mjs
```

非0終了、またはJSON判定が得られない場合は着手してはいけません。

Figma URLや「デザインどおりに直して」という依頼では、`C:\AI\figma-to-code\WORKFLOW.md`「着手前ゲート」の5点を報告するまで**ソースを1行も編集しません**。規則本文、読む順序、案件固有の記録先（案件側 `MyBrain/`）はすべて同ファイルにあります。
