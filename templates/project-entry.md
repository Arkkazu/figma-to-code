# 案件エントリ — Figma実装は figma-to-code の規則に従う

このファイルは `C:\AI\figma-to-code\templates\project-entry.md` の複製です。**直接編集せず**、正本を直してから再インストールします。規則本文はここに複製しません。

**最初のツール実行**で環境判定を実行します。cwdに依存しない絶対パスで呼びます。

```bash
node C:/AI/figma-to-code/tools/workflow-preflight.mjs
```

出力JSONの `mode` で分岐します。`mode` を得られない場合（ツールが無い、起動できない）は `cloud-restricted` として扱います。

`local` のとき。**Figmaをデザイン根拠とする実装・修正・再現・コーディングの依頼**では、まず次を実行し、`C:\AI\figma-to-code\WORKFLOW.md`「着手前ゲート」の5点を報告するまで**ソースを1行も編集しません**。規則本文、読む順序、案件固有の記録先（案件側 `MyBrain/`）はすべて同ファイルにあります。

```bash
npm run figma:gate -- start
```

**Figma URLが会話に出ているかどうかで判定しません。**「Figmaデザインを実装して」「Figmaどおりにコーディングして」「このFigmaを再現して」「デザインどおりに直して」「デザインと違う」、およびFigmaで設計された画面・コンポーネントの新規実装や見た目の修正は、すべてこれに当たります。判断に迷う依頼は、着手前ゲートを実行する側に倒します。`start` はゲートではなく編集を許可しないため、実行しても失うものはありません。

`cloud-restricted` のとき。このセッションには上位層が存在せず、案件側 `MyBrain/` も非公開部分は届きません。読める規則は案件クローンに含まれる `MyBrain/cloud/README.md`、`WORKFLOW.md`、`STATE.md`、`rules/` だけです。これらを読み、そこで許可された範囲に限定して作業します。ローカル実測、Figma照合、デプロイを要する作業はローカルセッションへ差し戻します。`MyBrain/cloud/` が無い案件では、従うべき規則を読めないため着手しません。
