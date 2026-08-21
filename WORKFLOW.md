# WORKFLOW.md — figma-to-code の唯一の実行規則

`C:\AI\figma-to-code` はFigma固有の規則・テンプレート・履歴の唯一の正本です。共通Vaultは上位の汎用原則、`C:\AI\web-development` はWeb実装の正本として先に読む。規則本文をエージェント別の入口へ複製しない。

## Figma実装・修正タスクの開始順

1. `C:\AI\vault\WORKFLOW.md`
2. `C:\AI\web-development\WORKFLOW.md`
3. 本ファイルと `README.md`
4. `rules/figma-spec-pipeline.md`、`rules/figma-scope-lock.md`、`rules/figma-mcp-implementation.md`、`rules/figma-image-export.md`、`rules/loop-execution.md`、`rules/self-improvement.md`、`rules/correction-log-promotion.md`
5. 案件側 `MyBrain/README.md`、`MyBrain/WORKFLOW.md`、`MyBrain/rules/`、案件側 `LOOP.md` / `STATE.md`

Figma URL付きの実装・修正では、Figma実物・spec・DOM対応表・実ブラウザ実測が揃うまで推測で編集しない。Figma照合はコーディング反復内で行い、Git hook、commit、push、deployでは実行しない。

Figmaの実装・修正scopeでは、編集前に D-012スコープロックとして `rules/figma-scope-lock.md` のscope manifestを開始する。visual・componentの修正scopeに、共通ルール、検証ツール、LOOP仕様、ログ昇格の変更を混ぜてはならない。これらはオーナーが明示した別scopeだけで扱う。

## 対象nodeの同定ゲート

ソースを編集する前に、オーナーが示したDOMとFigma nodeを次の全項目で照合し、案件側の対応表へ記録する。

1. 対象DOMのセレクター、親要素、ページ内の前後セクション、配置順
2. PC/SPそれぞれのFigma fileKey・node-id・座標・外接寸法
3. 直前・直後のFigmaセクション、および見出し・本文・ロゴ・CTA・注記などの主要構成

Figma上で同じ表示名のノード、同種CTA、同じ文言のボタンが複数ある場合、名称・文言・過去scopeのnode-idだけを根拠に選んではならない。提示DOMの前後関係と主要構成が一致しない候補は対象外とする。PC/SPのいずれかで一致しない、または候補が一意に定まらない場合は、実装・画像書き出し・比較画像登録を開始せず、オーナーへ不足情報を一つだけ確認する。

過去の対応表、比較画像、gate manifestは、今回のDOM位置とFigmaの前後関係を再照合してからだけ再利用できる。照合されていない既存記録は根拠にしてはならない。

## Figma差異指摘の保存先

- レイアウトがFigmaと異なるという指摘を受けたら、最初に案件側 `MyBrain/rules/corrections.md` へ対象URL、Figma node-id、対象DOM/CSS、期待値、実測差分、原因、再発防止を記録する。
- 同じ指摘から案件横断の工程失敗が判明した場合だけ、プロジェクト固有値を除いた抽象ルールを `rules/corrections.md` または `rules/mistakes.md` へ昇格する。
- `C:\AI\figma-to-code` には案件名、URL、node-id、セレクタ、数値、固有アセットを保存しない。案件固有の記録を共通ルールで代用しない。
- 案件横断のFigma失敗は手書き追記せず、`templates/figma-log-record.json` を埋めて `node tools/figma-log-promote.mjs record rules/log-promotion-policy.json <record.json> learning/log-promotions` を実行する。再発proposalは負のE2E、独立レビュー、オーナー承認まで `pending-review` とする。承認済み差分だけは `rules/correction-log-promotion.md` の `review` / `apply` 契約で昇格し、通常scopeから正本を自動変更しない。

## この手法自体を編集する場合

1. `LOOP.md` と `STATE.md` を読む。
2. `spec/QUESTIONS.md` の未回答または差し戻し設問を1件だけ扱う。
3. 仕様の起草・独立批評・STATE記録を分離する。
4. 案件固有の値・URL・認証情報をこのフォルダに書かない。
