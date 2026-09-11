# 可変デザイン数の検証契約

新しい可変幅契約は `manifest.figma.designs` を唯一の対象一覧とする。提供されたデザインを全件登録する。件数の上限は設けない。既存の宣言なしPC/SP manifestは旧契約として維持するが、追加viewportを旧契約へ混ぜると拒否する。

## 宣言

```json
{
  "figma": {
    "designs": [
      { "viewport": "pc", "width": 1440, "nodeId": "example-pc-root", "source": "provided" },
      { "viewport": "tablet", "width": 1024, "nodeId": "example-tablet-root", "source": "provided" },
      { "viewport": "narrow", "width": 768, "nodeId": "example-narrow-root", "source": "provided" },
      { "viewport": "sp", "width": 375, "nodeId": "example-sp-root", "source": "provided" }
    ]
  }
}
```

上記は書式例であり、幅・nodeIdは案件の実値へ置き換える。`viewport` は一意の小文字英数字・ハイフン識別子で、`pc`・`sp` を含める。幅も一意の正整数。`viewportNodes` は各designに対して同じviewport/nodeIdと比較画像を1件ずつ持つ。

PCのみ提供の場合は、提供PCと参照SPの2つを検証する。SP行を `source: "reference-page"` とし、`referencePage`（同一案件の別ページ）、`referenceReason`、参照SPの実nodeId・幅・画像・metadataを登録する。提供デザインがPCだけの場合に限り、この経路を認める。存在しない対象ページのSPデザインを作ったことにしない。SPのレイアウト期待値は参照ページ、対象の文言・内容はPCデザインを根拠として、対応表と各期待値のprovenanceへ記録する。参照ページが無ければオーナーへ確認する。

## 連動する入力

- `spec.viewports[]`: `id` をdesignのviewport、`width` をその幅と一致させ、全designを各1回登録する。追加幅をPCという同じ識別子へまとめない。
- 着手宣言の `figma.nodeIds`: 全viewportのキーを持ち、それぞれdesignのnodeIdを配列へ1件登録する。
- componentの `viewports`、`figmaImages`、任意の `visualThresholds`: 同じ識別子を使う。省略したcomponent viewportは、その幅のspecにrootの `display: "none"` または `visibility: "hidden"` の期待値が必要。可視要素の検証除外には使えない。
- 反復要素の `figmaNodeIds`・`selectors`: 全viewportを登録する。specの `repeatViewport` を併記する場合は `id` と一致させる。
- page coverage: `viewports` にdesignと同じ順の識別子を列挙し、`pages`・inventory・sectionsのノード表に全幅を登録する。metadataの実在・ハッシュ・所属・網羅性の検査は追加幅にも適用する。存在しない節は従来のnull＋理由によって明示する。

## ノード対応表

可変幅契約ではnode mapを `version: 3` / `schema: "viewport-scoped-roots/v1"` とする。

- `figma`: `fileKey`、`source`、`viewportRoots`（全viewportからdesignのpage root nodeIdへの表）。
- `sourceEvidence`: `nodeEvidencePath` と実ファイルの `nodeEvidenceSha256`。
- node evidence: `schema: "figma-node-evidence/v2"`、`fileKey`、`evidence[]`。各行に `viewport`・`role`・`nodeId`・`metadataPath`・`metadataSha256`。`role: "page-root"` は各designに1件、他のroleはscope rootの `scopeId` に対応する。
- `scopeRoots[]`: `scopeId`・`viewport`・`figmaNodeId`・`pageRootNodeId`・`metadataPath`・`metadataSha256`。固定の4 rootやPC/SPの相互pairingは要求しない。全viewportにrootを要求し、根拠metadataと実際の親子関係を検査する。
- `inventory.nodes[]` と `nodes[]` のフィールドは既存のscoped形式と同じ。全root配下のノードを分類する。全件の実在、重複、root所属、hidden継承、viewport別の測定漏れを検査する。

旧 `scoped-roots/v1` の制約は旧PC/SP契約で維持する。既存のP-3記録・認可をこの新契約へ自動移行しない。

## 実行・配布・限界

実行順は従来どおりpreflight → checkpoint → section-close → close。画像比較とレイアウト測定は全対象幅を同じbatchへ載せ、closeでも再測定する。文書を書き換えただけの既存受領証は再利用せず、新コード・新入力でpreflightを取り直す。

配布は `tools/verifier-distribute.mjs` を使い、`figma-gate.mjs`・`figma-gate.e2e.mjs`・`figma-page-coverage.mjs`・`viewport-contract.mjs`・`viewport-node-map.mjs`・`gate-contract-audit.mjs`・`gate-contract-audit.e2e.mjs` を一緒に指定する。新規依存2件を省くと起動できない。案件へは案件の明示scopeで配布する。

`figma-gate.e2e.mjs --viewports-only` は2・4・5デザインとPCのみ＋参照SP、および欠落・不一致の拒否を検査する。ブラウザとpixel比較にはテストダブルを使うため、CLIの経路・合否伝播・受領証の試験であり、実案件のFigma忠実度の証明ではない。accessibility/motionのシナリオは既存の各設定に従い、この契約で自動的に全幅へ複製しない。
