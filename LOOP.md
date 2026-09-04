# LOOP: figma-to-code-spec-dev

<!-- 雛形: ..\loop-engineering\templates\LOOP-spec-dev.md / 仕様: ..\loop-engineering\spec\05-spec-dev-loop.md -->

## メタ情報

- name: figma-to-code-spec-dev
- level: L2（節の確定は機械検査の合格＋人間承認）
- owner: kazu
- agents:
  - 起草役: 開始時にkazuが指定する。`spec/` の該当節を執筆し、QUESTIONS.md の状態を更新する
  - 批評役: **既定では置かない**（2026-09-04 オーナー指示「独立レビューが仕様だと作業効率が悪すぎる」）。合否は負のE2Eと機械検査で判定する。第三者の目が要ると判断したときだけ、kazuが担当を指定する

## 起動条件（Trigger）

- 手動（kazu が「1イテレーション実行」と指示）

## ゴール条件（Goal）

判定は `spec/QUESTIONS.md` のチェック状態で機械的に行う。

- QUESTIONS.md の全設問が `確定`（設問は kazu が随時追加し得るため、対象は常に QUESTIONS.md の現行全設問。2026-07-13 時点は Q-01〜Q-13）
- 各回答に検証可能な合否基準が付いている
- 仕様本文に未解決 TODO / FIXME が 0 件

## 停止条件（Stop）

- イテレーション上限: 30
- 同一設問での不合格連続: 3回 → 設問の立て方が悪い可能性。kazu にエスカレーション
- 手動停止: kazu の指示

## 手順（Procedure）— 1イテレーション

1. STATE.md を読む
2. QUESTIONS.md から `未回答` または差し戻しの設問を1つ選ぶ（原則 Q-01 から番号順）
3. 起草役が `spec/` に該当節を執筆し、QUESTIONS.md の状態を `起草済み` にする
4. 起草役が自分で検証する。観点: 曖昧さ / 根拠・出典 / 合否基準の検証可能性 / 設問への完全な回答。**検証器を足したら、その呼び出しを無効化して負のE2Eが実際に落ちることを確かめてから復元する**
5. 欠陥が出たら、指摘を書き残す代わりにその場で直す（共通Vault `rules/corrections.md` 2026-09-01）。直せたら状態を `合格（承認待ち）` にする
6. STATE.md に結果を追記する。`確定` への変更は kazu のみ

## 自己改善（Learn）

- モード: `proposal`。この手法の正本を扱うループでは、安全制御の直接適用ではなく、学習イベントと根拠付き提案だけを生成する。
- 学習イベント: Figma実装用テンプレートの `loop-learn.mjs` のE2E結果、所要時間、検証回数、scope逸脱、HTML検証記録を事実として扱う。
- 訂正ログ入力: `rules/corrections.md` / `rules/mistakes.md` の案件横断ログだけを `tools/figma-log-promote.mjs` で取り込む。案件固有の事実は案件側MyBrainに残す。
- ログ昇格: 同じ再発キーが閾値に達したときだけ、対象ルール・検証器・負のE2Eを含む `pending-review` 提案を出す。負のE2E・弱体化の実測・kazuの承認まで正本には反映しない。
- 昇格: 提案は差し戻し中のQ-12に紐付け、kazuの承認があるまで仕様・ルール・テンプレートの確定状態にしない。
- D-011起草: 横断ログは `record`、再発proposalは `scan`、検証は `review`、承認済み限定差分は `apply` を使う。`apply` は通常scopeのclose後処理には含めず、別の仕様育成イテレーションでだけ実行する。
- D-012採用: 実装scopeはscope lockで正確な編集パスを開始前に固定する。対象外パスが検知されたらblockedとして止め、同じscope内でルール・検証器・LOOPの改善を始めない。改善はownerが明示した別scopeでだけ扱う。
- 禁止: 学習結果を理由に、Figma照合、W3C、負のE2E、人間ゲートを弱めない。Git hook、commit、push、deployにも結び付けない。
## ガードレール（Guardrails）

- 触れるパス: `C:\AI\figma-to-code` 配下のみ
- 実行できるコマンド: ファイル読み書きのみ。Figma MCP の読み取り系（get_design_context, get_screenshot 等）は検証目的で使用可
- ネットワーク: Figma API / 公式ドキュメントの参照のみ
- 人間ゲート: 設問の追加・削除・変更 / 節の `確定` / DECISIONS への採用記録
