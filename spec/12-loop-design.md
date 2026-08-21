# 12. Figma実装ループ設計

- 状態: 確定（2026-07-30 オーナー承認。修正起草は STATE.md [66]、独立批評（claude）の合格判定は [77]）
- 目的: 実装と検証を分離し、ページ全体の漏れを防ぎながら、Figmaとの差分をコンポーネント単位で収束させる。

## 方針

運用の正本は `C:\AI\figma-to-code\LOOP.md`、Figma固有の実行規則は `rules/figma-spec-pipeline.md` とする。案件側の `LOOP.md` と `STATE.md` は、案件ごとの対象URL・Figma URL・承認・進捗だけを記録する。Figmaとの照合は実装反復と公開後の一回のrelease-checkで行い、Git hook、commit、push、deployには結び付けない。

## 1. 役割と独立性

| 役割 | 責務 | ソース編集 |
| --- | --- | --- |
| オーナー | 対象ページ・Figma URL・L2昇格・公開・完了を承認する | 任意 |
| 実装役 | L2で対象セクションを実装し、checkpointまで実行する | あり |
| 検証役 | Figma、spec、DOM対応表、component decision、実ブラウザ証跡を独立確認する | なし |

gate manifestには実装役の `implementationActor` と `implementationContextId` を、page coverage reviewとnew判定のレビューには `reviewerActor` と `reviewerContextId` を記録する。検証役は、実装役と**actorまたはcontextの少なくとも一方が異なる**必要がある。両方が同じならpreflightは拒否する。利用できない場合は、独立検証が未実施であることをSTATEに残し、完了として扱わない。

## 2. L1: 編集なしの準備

L1ではソースを編集しない。次を作成・記録する。

- PC/SPのFigma node、対象URL、基準viewport
- Figma取得結果と採用アセット証跡
- spec、DOM対応表、未対応・余計な要素リスト
- component decision manifest（全componentのreuse / extend / new / not-applicable判定、既存コード検索証跡、コード側パス、根拠）
- 実装actor/context、ページ全体page coverage、coverageハッシュに対する独立レビュー。new判定には独立承認、reviewer actor/context、レビュー証跡を含める
- 差分レポートとL2対象セクションの順序

オーナー承認をSTATEに記録してからL2へ進む。独立レビューと入力ハッシュが揃った後だけ、`preflight`を一度実行する。preflightはmanifest、spec、DOM対応表、component decision、Figma node/layer証跡を凍結する。

## 3. L2: セクション単位の反復

1回の反復は1つのtargetセクションだけに限定する。

1. `section-start` はactive preflight stateと凍結入力を再照合してから、先頭の `next` を `current` にする。照合失敗時はソース編集を開始しない。
2. 必要最小限のHTML、SCSS、JS、アセットを編集する。component decision manifestに無い新規作成は開始しない。
3. コンポーネントごとに `checkpoint` をPASSさせる。FAILならQ-10の原因診断→最小修正→**同一componentのcheckpoint再実行**をPASSまで繰り返す。
4. 検証役がFigma、DOM対応表、component decision、実ブラウザ証跡を独立確認する。
5. `section-close` はactive preflight stateと同じ凍結入力を再照合し、当該sectionのcheckpoint証跡整合性を確認してから対象を `verified` にする。

前のtargetが `verified` になるまで、次のtargetを開始しない。`context` はページ全体の位置関係を確認するために扱うが、checkpoint対象にはしない。

## 4. 実装の完了

ページ全体の `close` は、page coverageの全targetが `verified` であり、PC/SPの全spec、必要なpainted差分、静的検証がPASSしたときだけ実行できる。closeは最終状態で全componentの数値再測定とpainted差分の再計算を行う。`close`のPASSは**実装完了**の根拠であり、公開を伴う場合の公開完了とは別である。

## 5. 公開後のrelease-check

公開を伴う場合、オーナー承認済みのデプロイ後にだけ、固定済みのmanifest・spec・Figma参照画像を使い次を一度実行する。

```bash
npm run figma:gate -- release-check MyBrain/verify/gate-{対象}.json MyBrain/verify/release-{対象}.json
```

release recordは実行前に `pending`、`ownerApproved: true`、承認時刻、HTTPS公開URL、デプロイ識別子を持つ。gateは公開URLでPC/SPの全spec実測と全painted componentの再capture・再diffを行い、PASS時だけrecordを `passed` にして、実行時刻・固定入力ハッシュ・検証component一覧を追記する。recordのパス・SHA-256・URL・デプロイ識別子・時刻・PASS結果をSTATEに記録するまで、**公開完了**と報告してはならない。

この工程はFigma再取得、ローカルの全checkpoint、build/lint、closeの再実行を含まない。公開用の実測とpainted再照合だけを行う。公開URLが未反映・HTTPSでない・実測不能・FAILなら、公開完了ではなく未確認またはFAILとして扱う。

## 6. 合否基準との対応

- 実装と検証の役割分離・自己承認の拒否: §1
- 編集前の証跡・再利用判断・凍結: §2
- component単位の比較・修正反復と凍結変更の拒否: §3
- ページ全体の実装完了: §4
- 公開ページとの比較と公開完了の証跡: §5

## 参照

- `LOOP.md`
- `templates/LOOP.md`
- `spec/09-verification.md`
- `spec/11-done.md`
- `rules/figma-spec-pipeline.md`
- `rules/loop-execution.md`