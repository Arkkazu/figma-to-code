## 2026-08-30: symptom-by-symptom-serial-fixing
<!-- loop-log: {"id":"correction-serial-symptom-fixing-20260830","kind":"correction","failureClass":"symptom-by-symptom-serial-fixing","recurrenceKey":"symptom-by-symptom-serial-fixing","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":[]} -->
- 指摘：オーナー指摘「いまのチェックに時間がかかりすぎ。きみのミスで時間がかかっているのか」。
  2026-08-29〜30 に実装役が6回停止し、そのたびに検証器を1件ずつ直して配布した。停止の内訳は
  既存欠陥4件（sass:watch の style 不整合 / Q-13 の初期展開前提 / 座標クリックのヒットテスト欠落 /
  開閉の落ち着き待ち欠落）と、**自分が作った2件**（検証実行が残した preflight lock、
  座標クリック修正で入れた viewport 判定が smooth スクロールで誤発火）である。
- 原因：**症状ごとに直列で直した。**Q-13で停止した4件はすべて `runStateFlow` /
  `clickSelector` / `scanKeyboard` という同じ経路の**時間仮定の誤り**という単一の欠陥族だった。
  最初の停止時にこの経路の時間仮定を全部洗っていれば1回で終わった。実際には報告された症状だけを
  直して配布し、次の停止を待つことを4回繰り返した。配布のたびに `figma-gate.e2e`（実測30〜367秒）
  が回るため、往復そのものが高い。
- 今後：**検証器が停止したら、その症状だけを直さない。**同じ経路の同種の仮定を先に洗い出し、
  まとめて直してから配布する。特に次の3つは一度に点検する。(1) 非同期完了を待たずに観測している箇所
  （アニメーション、遅延ハンドラ、スクロール）、(2) 1回の観測で判定している箇所（リトライが無い）、
  (3) 実装の正当な設計を「閉じた状態から始まる」等と決め打ちしている箇所。
  修正を1件配布するたびに実装役を再開させ、次の停止を待つ進め方をしない。

## 2026-08-29: verifier-output-not-self-explaining
<!-- loop-log: {"id":"correction-verifier-output-not-self-explaining-20260829","kind":"correction","failureClass":"verifier-output-not-self-explaining","recurrenceKey":"verifier-output-not-self-explaining","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/correction-receipt.mjs","tools/figma-scope-lock.mjs","templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘：オーナー指示「codexが誤認しないようなルールにしないとだめだろ」。検証器の出力が、読み手に
  正しい解釈を与えていない。独立検証で3件の誤認が同時に起きた。(1) `figma-gate.e2e.mjs` は101秒かかり
  途中出力が無いため、90秒で打ち切った側が「未合格・未確認」と報告した。(2) 訂正受領証の
  `Project correction log changed...` は**定常手順**（受領証は記録時のlog hashを固定し、訂正が入るたび
  全件が失効する。実測115件中105通りのhash）だが、異常な停止と読まれた。(3) scope lockの `blocked` は
  状態ファイルに `reason` と5パスがあるだけで、既知の未実装欠陥（`figma-scope-lock.mjs` の
  `dirtySnapshot` がリポジトリ全体をbaselineにする。2026-08-25 `concurrent-scope-blocked-by-repo-wide-baseline`）
  が原因であることも、`begin` と `amend` が両方拒否して復帰不能であることも出力に無い。
- 今後：**読み手の注意深さに依存しない。出力そのものに解釈を持たせる。**検証器を書く・直すときは次を満たす。
  - **失敗メッセージは「定常手順」か「異常」かを名乗る。**定常手順なら、そのまま貼れる復旧コマンドを併記する。
  - **行き止まりは行き止まりと出力する。**復帰手段が無い、または特定の手段だけが有効なら、
    どのコマンドが拒否されるかを名指しし、次に誰へ何を求めるかまで書く。既知欠陥が原因なら
    その訂正IDを出力に含める。
  - **10秒を超える検証器は、開始時に所要目安を出し、途中で進捗を出す。**無反応に見える時間を作らない。
  - **打ち切りは「未合格」ではない。**時間で打ち切った場合は「打ち切り（N秒時点、完了行なし）」と書き、
    合否を断定しない。断定するなら完走させる。

## 2026-08-29: git-hook-scope-ambiguous
<!-- loop-log: {"id":"correction-git-hook-figma-vs-receipt-20260829","kind":"correction","failureClass":"git-hook-scope-ambiguous","recurrenceKey":"git-hook-scope-ambiguous","action":"clarify","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md","rules/loop-execution.md"],"verifierTargets":[]} -->
- 指摘：「Git hookでは実行しない」の対象が、規則本文と実装で食い違っていた。2026-07-18 の訂正は
  「未検証scopeは……Git操作を止める条件にはしない」と書いている。一方で案件には 2026-08-26 に
  `close-coverage-hook/v1`（pre-commit → `close-receipt-audit.mjs --require-coverage`）が設置され、
  close受領証に載っていない変更のcommitを実際に落としている（2026-08-29 実測：exit 1、
  covered 4 / stale 3 / uncovered 22）。字面では衝突するが、両者が禁じている対象は別物である。
- 書き分け（これを正とする）：
  - **禁止**：Git hook / commit / push / deploy で、Figmaの取得・照合・実測、`figma:gate` の
    preflight・checkpoint・section-close・close、学習器を**実行する**こと。理由は、Figma照合は
    コーディング反復内で行うべき工程であり、Git操作時に走らせると重複と遅延を生むため。
  - **許可**：既に発行済みの受領証とファイルhashを**照合するだけ**の検査でcommitを止めること。
    ブラウザもFigmaも起動せず、判定は hash 比較だけで完結する。ゲートを一度も起動しなければ
    どの検査も何も言わない、という抜け道（2026-08-26 オーナー指摘）を塞ぐ唯一の常駐点である。
- 2026-07-18「Git操作を止める条件にはしない」は、この書き分けの範囲で読む（2026-08-29 更新）。
  止めてよいのは受領証hash照合による停止だけで、Figma照合の実行は引き続き禁止する。

## 2026-08-25: independent-review-bypassable
<!-- loop-log: {"id":"correction-self-approval-via-second-context-20260825","kind":"correction","failureClass":"independent-review-bypassable","recurrenceKey":"independent-review-bypassable","action":"strengthen","promotability":"promotable","ruleTargets":["rules/loop-execution.md"],"verifierTargets":["templates/verify/figma-gate.mjs","templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘：独立レビューの機械検査が、実装役の自己承認を止められない。検査条件が reviewerActor と reviewerContextId の両方一致でのみ失敗するため、同一エージェントが別のcontextIdを名乗って自分のpage coverageをapprovedにすると素通りする。実測では、実装役が自分で承認記録を作成し、オーナーが指定した検証役とは別人格として登録していた。人間の指示では禁止されていたが、機械検査は通る状態だった。
- 今後：独立レビューの成立条件を、実装役と異なるactorであることを必須にするか、実装役のactorが自分のscopeのreviewerになれない形へ強める。contextIdの相違だけで独立性を認めない。レビュー記録の作成主体を検証器側で識別できるようにし、負のE2Eで自己承認が落ちることを固定する。

## 2026-08-25: concurrent-scope-blocked-by-repo-wide-baseline
<!-- loop-log: {"id":"correction-scope-lock-repo-wide-baseline-20260825","kind":"correction","failureClass":"concurrent-scope-blocked-by-repo-wide-baseline","recurrenceKey":"concurrent-scope-blocked-by-repo-wide-baseline","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-scope-lock.md"],"verifierTargets":["tools/figma-scope-lock.mjs","tools/figma-scope-lock.e2e.mjs"]} -->
- 指摘：scope lockが、宣言パスと交差しない他scopeの正当な作業でblockedになる。lockのbaselineはリポジトリ全体のdirty集合で、verifyは全体を突き合わせるため、別scopeが自分の宣言パスを正しく編集しただけで、無関係なscopeが停止する。実測では、オーナーが別セッションで進める正規のscopeがSCSSとCSSを更新したところ、宣言パスが1件も交差しない別scopeがblockedになり、再開にはstateの退避と再beginが必要になった。beginは既存stateがあると拒否するため、blockedからの復帰手順が用意されていない。同じ衝突判定でも、scope-conflict-auditは宣言パスの交差だけを見て交差しなければ並行を許すため、2つの機構で判定基準が食い違っている。
- 今後：scope lockのverifyを、宣言パスと制御パスに関係する変更だけで判定する形へ寄せ、無関係な変更はbaselineの更新として扱う。judgement基準をscope-conflict-auditの交差判定と一致させる。あわせてblockedからの正規の復帰手順（stateの退避と再baseline）を規則とツールに用意し、blockedのたびに新しいscopeを発行する運用に流れないようにする。
- **実装済み（2026-08-29、オーナー指示「根本の欠陥自体を解決しろ」）**：`verify` は宣言パスと制御パスに交差する変更だけで判定し、交差しない変更はbaselineへ取り込んで件数とパスを出力する。判定を狭めたぶん、宣言ファイル自体の改ざんを `scope-manifest-tampered` として落とす検査を新設した。復帰は `rebaseline <state> <approval>` を新設し、オーナー承認（`instruction` 20文字以上）を必須にした。`scope-manifest-tampered` は `rebaseline` では解除できない。負のE2Eで、交差しない変更で停止しないこと・2回目のverifyに再出現しないこと・manifest改ざんで停止すること・承認の不備3種を拒否すること・正経路で active へ戻ること・active に rebaseline できないことを固定した。規則本文は `rules/figma-scope-lock.md`「判定範囲」「blocked からの復帰」。

## 2026-08-25: gate-dead-end-without-handoff
<!-- loop-log: {"id":"correction-coverage-reapproval-deadend-20260825","kind":"correction","failureClass":"gate-dead-end-without-handoff","recurrenceKey":"page-coverage-review-invalidated-implementer-stops","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-page-coverage.mjs"]} -->
- 指摘：page coverage の独立レビュー承認は現在のcoverageハッシュにのみ有効で、対象を1つ追加しただけでも失効する。承認は独立性の要件により実装役が自分では作れない。この2条件が重なると実装役は自力で越えられない壁に当たるが、規則には『次に誰へ何を頼むか』が定義されていなかった。実装役は必須条件を述べて停止し、オーナーからは指示の拒否に見えた。工程の欠落であり実装役の判断ミスではない。
- 今後：承認が現在のcoverageに対して無効なとき、検証器は不足条件の内訳とコピー可能な独立レビュー依頼書（scopeId / coverageパス / 現在のSHA-256 / 直前に承認済みだったSHA-256 / 承認ファイルのパスと必須フィールド / 実装役のidentityとレビュー役のidentity制約）を出力する。規則側では、実装役が承認失効を理由に待機状態へ入ることを禁止し、同じターンで依頼書を出してレビュー役へ渡すところまでを実装役の工程とする。凍結入力チェックも、どの入力が動いたかを名指しで報告する。

## 2026-08-24: documented-command-not-executable
<!-- loop-log: {"id":"correction-unrunnable-documented-command-20260824","kind":"correction","failureClass":"documented-command-not-executable","recurrenceKey":"documented-command-not-executable","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["tools/doc-command-audit.mjs","tools/doc-command-audit.e2e.mjs"]} -->
- 指摘：規範文書が、実装の無いゲートサブコマンドと、必須の第2引数を欠いた呼び出しを判定手段として指定していた。書いてあるとおり実行すると失敗するため、写した側は工程を通せず、ゲートを飛ばす経路が開く。既存の検査は引数フラグの契約とパス表記だけを見ており、サブコマンドの実在と必須オペランドを検査していなかった。走査範囲も正本リポジトリ内に限られ、規則を写した下位層の文書は検査対象外だった。
- 今後：文書中のゲート呼び出しについて、サブコマンドの実在と必須第2引数の有無を、ゲート実装から導出した集合に対して機械検査する。検査の走査範囲を引数で拡張し、正本リポジトリの外にある下位層の文書も同じ検査にかける。

## 2026-08-21: partial-visual-verification
<!-- loop-log: {"id":"figma-subproperty-reporting-discipline-20260821","kind":"correction","failureClass":"partial-visual-verification","recurrenceKey":"figma-visual-subproperty-unverified-report","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.mjs","templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘：視覚要素の一部プロパティだけを測定し、未検証の方向・変形・完了ゲートを残したまま修正済みとして報告した。
- 今後：報告対象の視覚要素は位置、寸法、色、方向、状態、ゲート状態を独立した必須証跡として列挙し、未取得項目が一つでもあれば設計一致や修正完了と報告しない。

## 2026-08-21: partial-page-verification
<!-- loop-log: {"id":"figma-full-page-verification-required-20260821","kind":"correction","failureClass":"partial-page-verification","recurrenceKey":"figma-full-page-verification-before-completion","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.mjs","templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘：一部コンポーネントの照合結果をページ全体の設計一致として報告し、PC/SPの全セクションに差分がないことを確認しなかった。
- 今後：Figma実装の完了前にPC/SPのページroot全体を実ページ描画と照合し、全セクションを対応表で分類する。差分、未確認項目、または未closeのgateが一つでもあれば完了・設計一致と報告しない。

## 2026-08-21: unverified-completion-report
<!-- loop-log: {"id":"correction-unverified-completion-report-20260821","kind":"correction","failureClass":"unverified-completion-report","recurrenceKey":"completion-report-without-gate-receipt","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.mjs","templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘：Figma実装でデザインとの不一致が残ったまま完了報告が出た。完了条件は規則本文に複数箇所で明記されているが、いずれもゲートを実行した場合の合否を述べるだけで、ゲート実行そのものを必須とする機械的要件が無い。ゲートを実行しなければFAILも証跡も発生せず、報告は自己申告だけで成立する。
- 今後：完了報告の成立要件を散文の禁止から受領証の提示へ移す。figma-gate close の受領証（phase=closed、manifest hash、対象ファイルhash）が提示されない報告は、内容にかかわらず未検証として差し戻す。受領証検査をcoding:gate併用時の任意運用ではなくFigma scopeの既定とし、ゲート未実行のまま完了報告に到達できる経路を負のE2Eで検出する。

## 2026-08-21: unverified-completion-report
<!-- loop-log: {"id":"correction-machine-enforcement-completion-receipt-20260821","kind":"correction","failureClass":"unverified-completion-report","recurrenceKey":"machine-enforcement-first","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.mjs","templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘：デザインとの不一致が残ったまま完了報告が出た。完了報告の禁止は規則本文に8箇所あり、実行エージェントはその規則本文を実際に読んでいる。読んでも守られていないため、文章の追加では再発を止められない。完了条件はゲートを実行した場合の合否を述べるだけで、ゲート実行そのものを必須とする機械的要件が無く、未実行なら FAIL も証跡も発生せず報告だけが成立する。
- 今後：完了報告の成立要件を散文の禁止から受領証の提示へ変換する。figma-gate close の受領証（phase=closed、manifest hash、対象ファイルhash）が無い報告は内容にかかわらず未検証として扱う。受領証検査を coding:gate 併用時の任意運用ではなく Figma scope の既定とし、ゲート未実行のまま完了報告へ到達できる経路を負のE2Eで FAIL にする。

## 2026-08-20: visible-icon-asset-coverage
<!-- loop-log: {"id":"correction-visible-icon-asset-coverage-20260820","kind":"correction","failureClass":"visible-icon-asset-coverage","recurrenceKey":"visible-icon-asset-coverage","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.mjs","templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘：可視アイコンを外枠寸法だけで照合し、Figmaベクタの書き出し資産、描画inset、実装側のsrcと内容の対応を検証せずに合格としていた。
- 今後：Figmaの可視アイコンごとにレイヤーID、正規exportのSHA-256、描画inset、実DOMセレクタとsrc、個別画像差分範囲を台帳化し、台帳の欠落または不一致をpreflightとcheckpointでSPEC FAILにする。

## 2026-08-19: 比較画像は取得経路と内容を別々に照合する

- 指摘：Figma比較画像でnode-id・寸法・ハッシュ・実表示寸法だけを満たしたため、内容が異なる画像を正しいと判断した。
- 今後：比較画像は登録直前のFigma MCP `get_screenshot`原寸画像と登録PNGのピクセルまたはSHA-256を照合し、比較ボタンの実URLから取得した画像も同一性を照合する。取得経路の証跡だけでは登録・完了に進まない。

## 2026-08-19: inconsistent-comparison-export-scale
<!-- loop-log: {"id":"correction-comparison-overlay-export-scale-20260819","kind":"correction","failureClass":"inconsistent-comparison-export-scale","recurrenceKey":"comparison-overlay-export-scale","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-image-export.md"],"verifierTargets":["templates/verify/figma-gate.mjs","templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘：比較用Figma画像の書き出し倍率が等倍と2倍で混在し、選択根拠も証跡に残っていなかった。
- 今後：比較用画像はFigma設計座標の等倍で要求し、要求倍率・設計寸法・実画像寸法・書き出し上限による縮小有無をgate証跡へ残す。

## 2026-08-17: 共有ヘッダーの選択条件を変更するscopeではcontextに置かない
<!-- loop-log: {"id":"correction-shared-header-route-condition-20260817","kind":"correction","failureClass":"shared-header-route-condition","recurrenceKey":"shared-header-route-condition","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"共有部品の選択条件と実DOMの関係は案件ごとのルーティング実装に依存し、共通fixtureだけでは負のE2Eを正確に再現できないため。"} -->
- 指摘：仮想ルートを追加したscopeで共有ヘッダーを `context` として扱い、テンプレート側のページ種別判定が共有ヘッダーの選択条件に接続していることを検証対象から漏らした。本文はFigmaに沿っていても、実ページには旧ヘッダーが出力された。
- 今後：共有ヘッダー/フッターの本体、選択条件、または選択条件が参照するルート・ページ種別判定を追加・変更する場合、その共有部品を `context` に置かない。PC/SPの実DOMでルート要素、ブランド表示、操作要素を測定する `target` としてpage coverage・spec・component checkpointへ登録する。

## 2026-08-10: clean-room-boundary-overclaim
<!-- loop-log: {"id":"correction-p3-clean-room-boundary-evidence-20260810","kind":"correction","failureClass":"clean-room-boundary-overclaim","recurrenceKey":"clean-room-boundary-evidence","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"The access boundary depends on the actual host sandbox and session permissions, which the approved static verifiers cannot model without a real per-context access probe."} -->
- 指摘：A separate Windows account was presented as necessary before the P-3 clean-room contract and the actual local sandbox boundary had been tested.
- 今後：Treat a clean-room boundary as valid only after testing the exact execution context against the other condition worktree and common Git storage; do not substitute an untested operating-system account claim for that evidence.

## 2026-08-05: 反復カードのリンク先・画像同一性はDOM属性で照合する
<!-- loop-log: {"id":"correction-card-dom-identity-20260805","kind":"correction","failureClass":"card-dom-identity","recurrenceKey":"card-dom-identity","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器ではカード実DOM同一性の負のE2Eを現状再現できないため。"} -->
- 指摘：導入事例カードのpage coverageで、全カードの文言・矩形はspecにあったが、CRが求める`href`と画像そのものは未検証だった。`verify-layout.mjs`はcomputed styleと幾何しか測れず、異なるリンク先や画像への差し替えが黙って通る状態だった。
- 今後：共有`verify-layout.mjs`は`href`と`src`をレンダリング済みDOM属性として測定する。反復カード・リスト・CTAでリンク先または画像が契約要件なら、全可視itemに期待値を登録する。Figmaに存在しないリンク先は記録済みのオーナー決定を`owner-decision` provenanceとして対応表またはcorrection IDと併記する。属性期待値の不一致はLAYOUT FAILとして停止する。
- 検査：`verify-layout.e2e.mjs`でhref/srcの一致PASSと不一致FAILを、`figma-gate.e2e.mjs`で`owner-decision` provenanceの受理を回帰検証する。

## 2026-08-05: 非表示を期待するspec要素をreadiness待機へ含めない
<!-- loop-log: {"id":"correction-hidden-readiness-20260805","kind":"correction","failureClass":"hidden-readiness","recurrenceKey":"hidden-readiness","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器ではhidden要素の実装準備状態を負のE2Eで再現できないため。"} -->
- 指摘：SPページネーションの非表示itemをspecで`display:none`として正しく検証しようとしたが、CDPのreadinessが全selectorの可視化を待つため、正しい非表示状態のままtimeoutした。
- 原因：readinessと測定の責務を混同し、後段でcomputed styleを照合すべき非表示要素まで「可視であること」を前提にした。
- 今後：`display:none`または`visibility:hidden`を期待する要素はreadiness対象から除外し、測定結果のcomputed styleで厳密に照合する。可視・非表示の両方を含むE2E fixtureで退行を防ぐ。

## 2026-08-04: node map の figmaNodeId は実IDだけを使う
<!-- loop-log: {"id":"correction-node-map-real-id-20260804","kind":"correction","failureClass":"node-map-real-id","recurrenceKey":"node-map-real-id","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘：node map の網羅性検査（inventory との双方向照合）を入れた直後、最初に落ちたのが自分で作った node map だった。行内のテキストセルを `3288:45292:label` のような**役割ベースの合成ID**で180件登録していた。Figma には実IDがあるのに転記を省いていた。
- なぜ問題か：対応表としては読めるが、**Figmaのノードと機械的に繋がらない**。Figma側でノードが増減・改名しても追跡できず、証跡が「それらしく見えるだけ」になる。
- 今後：`figmaNodeId` は `get_metadata` が返した実IDのみ。位置や役割から合成しない。合成したくなったら metadata を取り直していないサイン。
- 併せて：**inventory は Figma の metadata から独立に作る。**node map から生成すると照合が空になり、検査そのものが無意味になる（実際に一度やりかけた）。

## 2026-08-04: 「実施済みか」の判定は、実施の証跡を見て決める
<!-- loop-log: {"id":"correction-execution-evidence-20260804","kind":"correction","failureClass":"execution-evidence","recurrenceKey":"execution-evidence","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘：W3C検証を実施して結果ファイルも置いたのに、postflight は再び「未実施」と報告した。判定が gate state の `w3cValidation` を読んでいたが、**そこへ書く仕組みが無く常に `not-recorded`** だった。検出側だけがあり、記録側が存在しなかった。
- 今後：**「実施済み」を判定する仕組みを作るときは、実施した側が記録する経路を同時に作る。**片方だけだと、正しく実施しても永久に未実施と報告され、やがて報告そのものが無視されるようになる。
- 実装：`w3c-check.mjs` が証跡（URL・検証時刻・Error件数・**検証時点のソースSHA-256**）を書き、`close` がそれを照合して state と close-report へ `w3cValidation` を記録する。ソースハッシュを持たせるのは、古い合格証跡の使い回しを防ぐため。

## 2026-08-04: 「検出はするが止めない」検査は、検出していないのと同じ扱いになる
<!-- loop-log: {"id":"correction-required-check-must-stop-20260804","kind":"correction","failureClass":"required-check-must-stop","recurrenceKey":"required-check-must-stop","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘：HTML/PHPを変更したscopeで close が PASS したが、必須のW3C検証が未実施だった。postflight の学習分析は `html-validation-missing` として検出していたが、**提案（pending-review）を出すだけで close を止めなかった**。実際にW3Cを走らせると Error 74件が出た。
- 構造：検出する仕組みと止める仕組みが別々にあり、検出側だけが動いていた。合格証跡（close PASS）には現れないので、読む人は問題なしと受け取る。
- 今後：**必須手順の未実施は close を止める。**止められない事情（実行手段が無い等）があるなら、close-report に「未実施」を明示的に載せ、完了報告の未確認リストへ機械的に転記する。提案キューに入れるだけにしない。
- 一般化：検査を追加するときは「検出したら何が起きるか」を決める。**止めない検出は、記録が増えるだけで挙動が変わらない。**

## 2026-08-04: 契約が「埋められない欄」を必須にすると捏造を強いる
<!-- loop-log: {"id":"correction-honest-contract-fields-20260804","kind":"correction","failureClass":"honest-contract-fields","recurrenceKey":"honest-contract-fields","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器では契約フィールドの意味的な正直さを負のE2Eで再現できないため。"} -->
- 指摘：page coverage は `pages.{pc,sp}.nodeId`（Figmaのページroot）を必須にしていたが、**社内向けの部品カタログページにはFigmaのページ設計が存在しない**（部品ドキュメントのキャンバスが散在するだけ）。存在しないIDを書かせることになり、捏造を強制する契約になっていた。セクション単位でも同様で、`figmaNodeIds` の両側nullを一律拒否していた。
- 今後：**契約に必須項目を足すときは「その欄を正直に埋められないケース」を先に洗う。**埋められない状態が実在するなら、空欄を許すのではなく**どちらなのかを書かせる**。
  - `pageKind`: `page-design`（既定、従来どおり）/ `component-reference`（Figmaページ設計が無い。`pageKindReason` 必須、`pages` は宣言禁止）
  - `figmaNodeUnknownReason`: 両側nullのとき必須（20文字以上）。「対応物が無い」のか「対応物はあるが未特定」なのかを明記させる
- 一般化：**必須化は「正直に書けない人を嘘つきにする」方向へ働きうる。**未確認・非該当を表現する語彙を同時に用意する。用意しないと、空欄で通す運用か、埋めるための捏造のどちらかになる。

## 2026-08-04: Figmaのテキストノードは文言を検証対象にする
<!-- loop-log: {"id":"correction-text-node-content-20260804","kind":"correction","failureClass":"text-node-content","recurrenceKey":"text-node-content","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘（オーナー）：componentsページを実装したのはCodex。数値は30行すべて一致していたのに、ラベルと注記が33箇所ずれたまま合格していた。「ルール通りやっていないならCodexがルールを守っていない。Codexでも守るように直せ」。
- 見落としの構造：specに幾何値だけを書いて**文言を書かなかった**。規則には「文言、明示改行をspec対象に含める」と書いてあるが、書かなくても検証器は落とさない。**文書に書いてあるだけの規則は、実装者が誰であれ守られない。**
- 今後：node map の `mapped` エントリに `figmaNodeType` を持たせ、**`TEXT` のノードは spec で `text` を検証することを必須にする**。図面上テキストであるものは、文言が一致して初めて実装したことになる。
- 一般化：**規則を追加したら「守らなかったときに何が落ちるか」を同時に決める。**落ちる仕組みが無い規則は、書いた本人以外には存在しないのと同じ。実装者がClaudeでもCodexでも同じ検査を通す。

## 2026-08-04: 期待値を持たないspec要素は「検証したふり」になる
<!-- loop-log: {"id":"correction-spec-expectation-required-20260804","kind":"correction","failureClass":"spec-expectation-required","recurrenceKey":"spec-expectation-required","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘：旧契約scopeの移行に着手して spec を開いたところ、**15要素すべてが `sel` と `note` だけ**で期待値が1つも無かった。検証器は比較する対象がゼロなので何も落とさず合格する。証跡には要素数だけが残り、検証したように見える。案件全体では666要素中17件が該当し、うち15件が同一scopeに集中していた。要素が1つも無い spec も11件あった。
- なぜ通っていたか：`assertSpecProvenance` が「測定キーが0個の要素」を `continue` で読み飛ばしていた。provenance の検査対象外にする意図だったが、結果として**主張ゼロの要素を無検査で通す穴**になっていた。
- 今後：**spec要素は必ず1つ以上の期待値を持つ。**持たない要素は preflight で拒否する（幅・高さ・topInSection・computed style のいずれか）。書けないなら要素ごと消す。`viewports` と `elements` が空の spec も通さない。
- 一般化：**「検査対象が0件」は成功ではない。**件数を数える仕組みを作ったら、0件のときに合格するのか失敗するのかを必ず決める。

## 2026-08-04: 証跡を退避するときは、残る義務を同じ出力に載せる
<!-- loop-log: {"id":"correction-archived-evidence-obligation-20260804","kind":"correction","failureClass":"archived-evidence-obligation","recurrenceKey":"archived-evidence-obligation","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器には退避後の運用義務を再現する負のE2Eが存在しないため。"} -->
- 指摘：参照デザインが現行でない証跡は移行できないため退避するが、退避すると監査の一覧から消える。**backlogが片付いたように見えて、実際にはそのページの検証義務が残っている。**
- 今後：退避と同時に「ページ / 退避した旧manifest / 現行のverifyUrl」を台帳の `pendingPageVerification` へ移し、**監査の出力に必ず載せる**。別ファイルに書くだけでは読まれない。退避は削除ではなくファイル移動で行う（案件ディレクトリが `.gitignore` 対象だと削除は復元不能）。
- 一般化：**数を減らす操作は、減った分がどこへ行ったかを同じ画面に出す。**出さないと、集計が改善したように見える。

## 2026-08-04: 旧契約の棚卸しでは、参照デザインが現行かを先に見る
<!-- loop-log: {"id":"correction-current-design-reference-20260804","kind":"correction","failureClass":"current-design-reference","recurrenceKey":"current-design-reference","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器には参照デザインの現行性を再現する負のE2Eが存在しないため。"} -->
- 指摘：旧契約manifestを「契約の必須項目が欠けているだけ」と見て移行計画を立てたが、実測すると**過半が別のFigmaファイルを根拠に検証されていた**（ある案件で27件中13件、旧ファイル4種）。契約を満たすよう項目を足しても、参照デザインが現行でなければ現行デザインに対する根拠にはならない。移行ではなく作り直しの対象。
- 見つけにくい理由：旧ファイルは同じ node ID を持つことがあり、寸法や可視性だけが違う。manifestを開いても fileKey を突き合わせない限り気づかない。
- 今後：棚卸しは「契約の欠落」より先に **`figma.fileKey` が現行ファイルかどうか**で仕分ける。案件に `MyBrain/verify/figma-project.json`（`currentFileKey`）を置き、`gate-contract-audit.mjs` に照合させる。fileKeyは必ずオーナー提供のURLから抽出し、過去のmanifestから流用しない。
- 併せて確認する再実行可否：`verifyUrl` が現行ホストか、`specPath` の実体があるか、`changeTargets` が今も存在するか。実測では旧URL（開発サーバのlocalhost等）が10件あり、そのままでは再実行できなかった。

## 2026-08-04: 抜け穴が常用され始めたら、正当なケースを機械判定に変える
<!-- loop-log: {"id":"correction-exception-to-mechanism-20260804","kind":"correction","failureClass":"exception-to-mechanism","recurrenceKey":"exception-to-mechanism","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘：編集前ゲートの逃げ道である `preEditApproval`（オーナー承認）を、1セッションで2回使った。どちらも正当な理由（先行scopeの未コミット変更、閾値実測後の再preflight）だったが、**ゲートは正当か不当かを区別できない**。抜け穴が常用され始めるのは、当初塞いだはずの「規律に頼る」状態へ戻る兆候。
- 今後：抜け穴の使用が常態化したら、使用理由の**最も多いケースを機械判定へ移す**。今回は `close` が変更対象の最終ハッシュを close-report の `fileHashes` へ残し、後続scopeの `preflight` が「dirtyの内容が合格済みscopeの成果と一致するか」を照合するようにした。一致すれば承認不要、1バイトでも違えば従来どおりFAIL。**抜け穴は残すが、正当なケースで使う理由を消す。**
- 一般化：抜け穴の使用回数は、契約設計の欠陥を示す指標として扱う。「毎回承認している」は「承認が機能していない」と読む。

## 2026-08-04: 画素差分は線画のサイズ誤りをほぼ検出できない
<!-- loop-log: {"id":"correction-line-art-diff-limit-20260804","kind":"correction","failureClass":"line-art-diff-limit","recurrenceKey":"line-art-diff-limit","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器には線画の視覚差分限界を再現する負のE2Eが存在しないため。"} -->
- 実測：アイコンを41%過大に描画していた状態の差分画素は972、正しい寸法に直した後は840。差はわずか132（比率で0.00013）だった。pixelmatchはアンチエイリアス画素を除外するため、輪郭線が主体の図形は誤りが数値に現れない。
- 今後：**アイコン・ロゴ・図形の正しさを画素差分の比率で判断しない。**素材は `assets[].exportSha256` で書き出し物と実体の一致を担保し、寸法・位置はCDP実測の枠サイズで押さえる。比率が下がらないことを「差がない」根拠にしない。

## 2026-08-04: Figmaの書き出しベクタを contain で敷かない
<!-- loop-log: {"id":"correction-vector-contain-sizing-20260804","kind":"correction","failureClass":"vector-contain-sizing","recurrenceKey":"vector-contain-sizing","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器には書き出しベクタの実効表示寸法を検証する負のE2Eが存在しないため。"} -->
- 指摘：Figmaがアイコンとして書き出すのは**タイトにクロップされたベクタ**で、枠のサイズを持たない。`background: center / contain` で枠に敷くと枠いっぱいまで拡大され、実測で最大41%過大になった。既存アセットが枠を埋める形で作られていると、差し替えた瞬間に破綻する。
- 今後：`get_design_context` が返すアイコン枠内の inset（`inset-[t% r% b% l%]`）から、`background-size` と `background-position` を算出して指定する。inset は枠に対する比率なので、PC/SPで枠サイズが違っても同じ値で成立する。
  - `background-size` = `(100 − 左% − 右%)` × `(100 − 上% − 下%)`
  - `background-position` = `左% ÷ (左% + 右%)` と `上% ÷ (上% + 下%)`（枠と画像の差分に対する割合）

## 2026-08-03: 先行scopeの証跡を複製したら、scope固有の記述を全件書き換える
<!-- loop-log: {"id":"correction-copied-evidence-scope-content-20260803","kind":"correction","failureClass":"copied-evidence-scope-content","recurrenceKey":"copied-evidence-scope-content","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器には文章の意味的なscope適合を再現する負のE2Eが存在しないため。"} -->
- 指摘（独立レビュー）：後続scopeのpage coverageを先行scopeから複製した際、`deferred` の `reason` 25件すべてが**前のscopeの記述のまま**だった。「本scopeは機能Cセクションのみを対象とする」という文が、機能Aのscopeの証跡に残っていた。さらに1件は本scopeの対象ノードIDを別セクションのIDと誤記していた。並び順も前のscopeのまま（共有ヘッダーが26番目）で、Figmaページ証跡の順序と一致していなかった。
- なぜ検証器が見逃したか：`reason` は非空文字列でありさえすれば通る。「理由が書かれていること」は機械で検査できるが、「その理由が**このscopeを正しく説明していること**」は検査できていなかった。
- 今後：**証跡ファイルを複製したら、scope固有のフィールドを機械的に列挙して全件書き換える。**複製元をそのまま出さない。検証器側では coverage に `scopeId` を持たせて manifest の `id` と一致を必須にし、複製したままでは通らないようにした（変更せず再利用する場合は `sharedWithScopes` に明示）。並び順は `sections` と `inventory` の一致を必須にした。
- 一般化：**「非空文字列であること」しか検査していないフィールドは、複製時に陳腐化する。**そのフィールドが scope 固有の内容を持つなら、scope の同一性を別途機械検査する。

## 2026-08-03: close-report に契約バージョンを刻む
<!-- loop-log: {"id":"correction-close-contract-version-20260803","kind":"correction","failureClass":"close-contract-version","recurrenceKey":"close-contract-version","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘：`completed` ロールは参照先close-reportの実在・target列挙・FAIL 0を検査していたが、**その close がどの契約の下で走ったかを見ていなかった**。旧契約のclose-reportは3条件をすべて満たすため、旧契約のscopeを「検証済み」として持ち込めてしまう。台帳（legacy-scopes.json）で旧契約を可視化しても、この経路が残っていれば迂回できる。
- 今後：close-report へ `contractVersion` を刻み、`completed` は現行バージョン以上を要求する。`contractVersion` を持たないclose-reportは0（＝バージョン導入前の契約）と判定する。契約に必須検査を足したら番号を上げる。番号を上げると既存のcloseは自動的に旧契約になるため、監査は「manifestの項目は揃っているがcloseが古い」状態も検出する。

## 2026-08-03: 検証の待機上限はプロトコル往復とページ読み込みで分ける
<!-- loop-log: {"id":"correction-wait-budget-separation-20260803","kind":"correction","failureClass":"wait-budget-separation","recurrenceKey":"wait-budget-separation","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器には環境依存の待機上限分離を再現する負のE2Eが存在しないため。"} -->
- 指摘：CDPクライアントの単一タイムアウトを、プロトコル往復・起動待ち・ページ遷移のすべてに使っていた。ローカルのCMSはHTMLだけで数秒かかることがあり、フォントと画像を含めると`Page.navigate`だけが断続的に落ちる。実装に不備がなくても検証が止まる。
- 今後：プロトコル往復の上限と、ページ遷移・描画完了の待機上限を別に持つ。後者は環境差が大きいので環境変数で上書きできるようにする。待機上限は撮影条件ではないので、延ばしても合否基準は変わらない。

## 2026-08-03: 子プロセスを持つツールはプロセスツリーごと終了させる（Windows）
<!-- loop-log: {"id":"correction-windows-process-tree-20260803","kind":"correction","failureClass":"windows-process-tree","recurrenceKey":"windows-process-tree","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器にはWindowsの子プロセス終了を再現する負のE2Eが存在しないため。"} -->
- 指摘：`child.kill()` は起動した親プロセスにしか効かない。Windowsは子プロセスを親に紐づけないため、Chromeのrenderer / GPU / utilityが孤児として残りうる。
- 今後：win32では `taskkill /pid <pid> /T /F` でツリーごと落とす。なお**「残プロセスが多い＝リークだ」と面積や件数だけで断定しない**。実測では残っていた40件は利用者の通常のChromeで、検証由来は0件だった。コマンドラインで起動元を特定してから判断する。

## 2026-08-03: 契約を強化したら旧契約scopeの棚卸しを同時に行う
<!-- loop-log: {"id":"correction-contract-upgrade-audit-20260803","kind":"correction","failureClass":"contract-upgrade-audit","recurrenceKey":"contract-upgrade-audit","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器には旧契約scopeの棚卸し全体を再現する負のE2Eが存在しないため。"} -->
- 指摘：検証契約に必須項目を足すたび、既存のgate manifestは自動的に旧契約になる。旧契約のscopeは preflight で落ちるが、落ちること自体を誰も見ていないため、**過去の完了報告が現在の基準を満たしていない事実が黙って残る**。実測では27件中25件が旧契約だった。
- 今後：契約を強化したらその場で `gate-contract-audit.mjs` を実行し、影響範囲を数で確認する。未移行は `legacy-scopes.json` へ移行先scope付きで明示宣言する。宣言のない旧契約manifestも、移行済みなのに残る宣言も失敗にする（双方向）。台帳は免除ではない。**旧契約でcloseしたscopeを「Figmaどおり検証済み」として扱わない。**

## 2026-08-03: Figmaの行送りは整数pxへ丸められる
<!-- loop-log: {"id":"correction-figma-line-height-rounding-20260803","kind":"correction","failureClass":"figma-line-height-rounding","recurrenceKey":"figma-line-height-rounding","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器ではFigma由来line-heightの丸め規則を負のE2Eで再現できないため。"} -->
- 指摘：デザイントークンの行間%（例 16px/160%＝25.6px）をそのままCSSへ写したが、Figmaのテキストエンジンは行送りを整数pxへ丸めて描画しており、実描画は26pxだった。
- 影響：1行あたりの差は0.4pxで許容差に埋もれる。3行の要素は誤差1.2pxでPASSし、9行の要素で3px累積して初めて露見した。行数の少ない要素だけを見ていると通過する。
- 今後：line-heightはトークンの%を採らず「Text nodeの高さ ÷ 行数」で検算する。同じトークンを使う要素のうち最も行数の多いものを検算対象にする。specのprovenanceは`design_context`ではなく`metadata`（ノード高さ）にする。

## 2026-08-03: 矩形に出ない性質はspecへ明示しないと素通りする
<!-- loop-log: {"id":"correction-nongeometric-spec-property-20260803","kind":"correction","failureClass":"nongeometric-spec-property","recurrenceKey":"nongeometric-spec-property","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器ではFigma必須の非幾何プロパティ欠落を負のE2Eで再現できないため。"} -->
- 指摘：`text-align`がPCの中央寄せのままSPへ継承されていたが、`getBoundingClientRect`ベースの実測は全項目PASSした。画像差分だけが検出した。
- 今後：揃え・太さ・装飾など矩形に現れない性質は、specの期待値として明示する。同一要素でもPC/SPそれぞれの`get_design_context`を取り、クラスの有無を比較する。検証器の測定項目に`textAlign`・`fontWeight`を追加済み。

## 2026-08-03: 画像差分の原因は面積ではなく差分画素の座標で特定する
<!-- loop-log: {"id":"correction-diff-coordinate-diagnosis-20260803","kind":"correction","failureClass":"diff-coordinate-diagnosis","recurrenceKey":"diff-coordinate-diagnosis","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器には差分画素の原因座標特定を再現する負のE2Eが存在しないため。"} -->
- 指摘：差分比が閾値超過したとき、面積の大きい領域を主因と推定してmaskで除外した。実際にはその領域の差分画素は0で、maskは分母だけを縮めて比率を悪化させた。
- 今後：差分画像の赤画素を行・列に集計して座標分布を出し、原因領域を特定してから対処する。mask適用後は`diffPixels`が実際に減ったかを確認する。減っていなければ前提が誤り。

## 2026-08-03: サブピクセル領域では画素差分とレイアウトの正しさが単調に対応しない
<!-- loop-log: {"id":"correction-subpixel-diff-nonmonotonic-20260803","kind":"correction","failureClass":"subpixel-diff-nonmonotonic","recurrenceKey":"subpixel-diff-nonmonotonic","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器にはサブピクセル差分の非単調性を再現する負のE2Eが存在しないため。"} -->
- 事実：テキストブロックのFigmaとの縦ずれを0.8pxから0.4pxへ縮めた（＝Figma実値に一致させた）ところ、画素差分比は0.02872から0.03198へ**増えた**。グリフのラスタライズはピクセル格子との位相で決まり、半ピクセル位置が最悪になるため。
- 今後：画素差分比の増減を実装の良否の判定に使わない。**判定はCDP実測層（height・lineHeight・textAlign・topInSection）で行い、画素差分は「測定項目に無い誤り」の検出器として使う。**ラスタライズ下限を決めるときは単発の測定値ではなく、観測した位相のうち最大値を採る。

## 2026-08-03: 画像差分の閾値は実測した下限に基づいて宣言する
<!-- loop-log: {"id":"correction-visual-threshold-basis-20260803","kind":"correction","failureClass":"visual-threshold-basis","recurrenceKey":"visual-threshold-basis","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘：高密度の日本語テキストが占める領域では、Figma書き出しとブラウザのラスタライズ差だけで無視できない差分比が出る。単一の固定閾値はビューポート間で意味が変わり、片方を素通しにする。
- 今後：painted componentの閾値はビューポート別に持ち（`visualThresholds`）、既定の厳格値を超える場合は`visualThresholdBasis`へ「実測した下限」と「取得方法」を書く。記述がなければpreflightがFAILする。閾値は下限と、実際に検出できた最小の誤りの中間に置く。

## 2026-08-02（2）: page coverageの証跡は「文字列があること」で満たさない
<!-- loop-log: {"id":"correction-page-coverage-semantic-evidence-20260802","kind":"correction","failureClass":"page-coverage-semantic-evidence","recurrenceKey":"page-coverage-semantic-evidence","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘（codexの独立レビュー3件）：(1) `pages.pc/sp` にページrootではなくscope対象のsection nodeを書いていた。ページroot配下の全セクションを網羅する契約なのに、起点がページでないため証跡として成立しない。共有ヘッダー・フッター（Header_pc / Header_sp / Footer Section）もinventoryから漏れていた。(2) PC側が2グループに分かれるセクションを、1グループだけ `figmaNodeIds` に登録し、残りを説明文へ書いていた。機械検査の対象外になる。(3) `deferred.followUpScope` を文字列の存在だけで検査しており、実在しないscope名でも通る。負のE2Eも任意文字列を通すだけだった。
- 今後：`pages.pc/sp` には**ページroot**のnodeとページ単位のメタデータ証跡を置く。scope対象のnodeを書かない。共有ヘッダー・フッターもinventoryに含め、`context` として分類する。1つの論理セクションがviewportで複数nodeに分かれる場合は、`related-service-primary` / `-secondary` のようにsectionIdを分けてPC/SP対を個別登録するか、複数node配列を機械検査できるスキーマへ拡張する。どちらの場合も**説明文に書いて済ませない**。
- 今後（`followUpScope`）：後続scopeの参照は、実在する scope manifest または計画台帳のエントリを指すことを検査する。文字列の存在検査だけでは追跡可能な証跡にならない。負のE2Eにも「実在しないscope名を拒否する」ケースを含める。
- 原則：**証跡フィールドを追加するときは、その値が機械的に検証されるかを同時に決める。**検証しない値は証跡ではなくメモであり、メモを証跡の位置に置かない。

<!-- ここから下に追記していく。最新を上に。 -->

## 2026-08-02: page coverageを inventory と scope contract に分離する
<!-- loop-log: {"id":"correction-page-coverage-inventory-20260802","kind":"correction","failureClass":"page-coverage-inventory","recurrenceKey":"page-coverage-inventory","action":"strengthen","promotability":"promotable","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘（codexの独立レビュー）：`spec/09-verification.md` §4 は「ページ全体のセクションを登録し対象外を暗黙に扱わない」と求めるが、`templates/verify/figma-page-coverage.mjs` は `context` を `shared-header` / `shared-footer` に限定し、それ以外を `target` かつcomponent必須とする。**単一セクションのscopeではこの両方を同時に満たせない**。対象外を検証器が読まないフィールド（`_outOfScopeSections` 等）へ置く回避策は、カバレッジ要件を満たさない。
- 今後：page coverageを2層に分ける。**page-inventory** はPC/SPのページroot配下の全セクションをPC/SP対で固定するページ単位の不変証跡。**scope-coverage** は今回のtarget、共有header/footerのcontext、未着手セクションのdeferredを宣言するscope単位の実行契約。検証器は「page-inventoryの全セクションが target / context / deferred のいずれかに一意に分類される」ことを検査する。`deferred` はcomponent不要・checkpoint対象外だが、**PC/SP nodeと理由と後続scopeを必須**にする。`context` を共有部品だけに限定する現行方針は維持する。
- 適用：この契約変更は `C:\AI\figma-to-code` の専用scopeで、正本ルール・テンプレート・負のE2Eをまとめて整備する。通常のFigma実装scopeへ混ぜない（D-012）。整備が終わるまで、単一セクションscopeのpage coverageは独立レビューを通過できない。

## 2026-07-31: Text nodeの行数と省略表示を一組で検証
<!-- loop-log: {"id":"correction-text-ellipsis-contract-20260731","kind":"correction","failureClass":"text-ellipsis-contract","recurrenceKey":"text-ellipsis-contract","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器ではFigma必須のellipsis契約欠落を負のE2Eで再現できないため。"} -->
- 指摘：固定heightと`overflow: hidden`で可視3行だけを確認し、Figmaが指定する末尾の3点リーダーを確認しなかった。
- 今後：Text nodeに省略仕様がある場合は`lineCount`だけで合格にしない。`overflow`、`textOverflow`、`webkitLineClamp`、必要時`display`までspecへ登録し、Figmaのellipsisまたはclip指定と実DOMを照合する。

## 2026-07-31: テキストの可視行数はoverflow後を測る
<!-- loop-log: {"id":"correction-visible-line-count-20260731","kind":"correction","failureClass":"visible-line-count","recurrenceKey":"visible-line-count","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器では可視行数の仕様欠落を負のE2Eで再現できないため。"} -->
- 指摘：`Range.getClientRects()` の総数を行数としており、Figmaが固定heightと`overflow: hidden`で3行だけを表示するText nodeを4行と誤判定した。
- 今後：`lineCount` は対象elementの表示領域と交差する行だけを数える。Text nodeのwidth、height、line-height、white-space、可視行数をセットで照合する。
---
type: rule-history
status: permanent
date: 2026-07-17
topic: Figma実装の修正指示の蓄積
tags: [Figma, history, corrections]
---

# Figma実装の修正指示の蓄積

> このフォルダは、案件をまたいで再発するFigma実装の失敗・規則の唯一の正本とする。共通Vault（`C:\AI\vault`）には複製しない。対象ページ、Figma node-id、固有の文言・寸法・HTML・アセット・実測値は各案件の `MyBrain/rules/corrections.md` に保存する。

Figmaデザインの実装・修正に関する恒久ルールを記録する。

---

> [!note] 旧呼称について（2026-07-29）
> 共通Vaultは `C:\AI\vault`（旧 `C:\AI\MyBrain`）。以下の過去記録に出る「共通MyBrain」は
> 当時の記録としてそのまま保存している。現在の参照先は `C:\AI\vault` と読み替える。
> 案件リポジトリ内の `MyBrain/` は改名していない。

## 2026-07-31（2）: 規則の追加ではなく機械強制で塞ぐ
<!-- loop-log: {"id":"correction-machine-enforcement-first-20260731","kind":"correction","failureClass":"machine-enforcement-first","recurrenceKey":"machine-enforcement-first","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器では全規則の機械強制対応という抽象原則を負のE2Eで再現できないため。"} -->
- 指摘：Figmaどおりに実装できず比較も正しくできない状態が続いた。実行エージェントの自己申告した15件の原因のうち、親子構造の事前確定、PC/SP独立実測、親のgap・幅の再確認、折返し・行数・末尾表現の照合、対象範囲を超えた合格報告など大半は、すでに `figma-spec-pipeline.md` に明文化済みの項目だった。読んでも守られない状態を、さらに文章を足して解決しようとしない。
- 今後：同種の再発に対しては、まず「その項目は既に規則にあるか」「機械が失敗させられるか」を分けて確認する。既に規則があるなら文章を追加せず、`templates/verify/figma-gate.mjs` の `preflight` で FAIL にできる形へ変換する。特にDOM対応表は `mappingSha256` によるハッシュ固定だけで内容が未検証だったため、機械可読形式にしてFigma子ノード単位のカバレッジを検査する。カバレッジ検査をcomponent単位で止めない。
- 報告：合格件数を書くときは必ず分母（宣言済み対象数 / ページ全体のセクション数）と、未検証の範囲を併記する。「26 passed / 0 failed」のように対象範囲を書かない合格報告をしない。

## 2026-07-31: 反復componentのテキストleaf実測
<!-- loop-log: {"id":"correction-repeat-text-leaf-measurement-20260731","kind":"correction","failureClass":"repeat-text-leaf-measurement","recurrenceKey":"repeat-text-leaf-measurement","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器では反復テキストleaf全件測定の欠落を負のE2Eで再現できないため。"} -->
- 指摘：カード外枠と文字列だけを照合し、企業名`dd`の幅・折返し・描画行数を確認しなかった。
- 今後：Figmaの個別Text nodeに対応する`h1-h6`、`p`、`dt`、`dd`、`li`、`a`、`button`をPC/SP specへ個別登録する。width、height、line-height、`white-space`、`lineCount`を実DOMで照合し、親wrapperのPASSで代替しない。

## 2026-07-31: 反復カードの値・順序の全件照合
<!-- loop-log: {"id":"correction-repeat-card-complete-order-20260731","kind":"correction","failureClass":"repeat-card-complete-order","recurrenceKey":"repeat-card-complete-order","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器では反復カード全件順序照合の欠落を負のE2Eで再現できないため。"} -->
- 指摘：導入事例の企業名`<dd>`がFigmaと異なるのに、カード外枠と先頭要素だけの確認で実装完了としていた。
- 今後：カード・表・検索結果などの反復要素は、各viewportの全可視itemについてFigma順とDOM順、title、label、`dt/dd`、補助文言、画像、hrefを実DOMで1対1照合する。先頭1件・配列定義・コンテナ寸法だけの確認は禁止する。

## 2026-07-31: 共通部品流用前の色・アセット照合
<!-- loop-log: {"id":"correction-component-reuse-asset-check-20260731","kind":"correction","failureClass":"component-reuse-asset-check","recurrenceKey":"component-reuse-asset-check","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器ではreuse部品の色・状態・asset照合欠落を負のE2Eで再現できないため。"} -->
- 指摘：共通の外部リンクアイコンを流用できると判断し、対象Figmaのポリシー欄が別色・別アセットであることを実装前に確認しなかった。
- 今後：reuse / extendを選ぶ前に、対象Figma nodeと既存部品について色、アセットURL・SHA-256・形式、通常/hover/open等の状態差分を照合してdecision manifestへ記録する。未照合なら流用確定・実装開始を禁止する。

## 2026-07-30: scoped-fix-execution-drift
<!-- loop-log: {"id":"correction-20260730-scoped-fix-execution-fence","kind":"correction","failureClass":"scoped-fix-execution-drift","recurrenceKey":"scoped-fix-execution-drift","action":"strengthen","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.mjs","tools/figma-scope-lock.mjs","tools/figma-scope-lock.e2e.mjs"]} -->
- 指摘：単一対象のFigma修正で、既存の対象外検査失敗を起点に確認と作業を拡張し、固定した修正ラウンドを逸脱した。
- 今後：編集前のlint基準線と許可済みの実行順を固定し、対象外の既存失敗は別scopeの記録だけに留め、修正・再検証・完了判定へ混入させない。

## 2026-07-29: proactive-fidelity-improvement
<!-- loop-log: {"id":"correction-proactive-fidelity-improvement-20260729","kind":"correction","failureClass":"proactive-fidelity-improvement","recurrenceKey":"proactive-fidelity-improvement","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器には予防的監査の必要性を再現する負のE2Eが存在しないため。"} -->
- 指摘：案件で発生した同種の失敗だけを共通ルール改善の入力として説明した。これでは新しいFigma機能・変換・検証の抜けを失敗後にしか改善できない。
- 今後：案件横断ログによる再発防止に加え、案件投入前にFigma機能の取得・spec化・変換・検証の対応表を監査し、未対応・検証不能・根拠不足を改善提案にする予防的なグラフを運用する。提案の正本反映は独立レビューとowner承認を要する。

## 2026-07-29: figma-to-code-is-cross-project-rulebook
<!-- loop-log: {"id":"correction-cross-project-rulebook-20260729","kind":"correction","failureClass":"cross-project-rulebook","recurrenceKey":"cross-project-rulebook","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器には案件横断の情報配置原則を再現する負のE2Eが存在しないため。"} -->
- 指摘：figma-to-codeを特定案件のベンチマーク実行場所のように説明した。これは様々な案件でFigmaから正確に実装するための案件横断の正本である。
- 今後：案件固有のFigma URL、node-id、実装コード、実測値、差分は案件側MyBrainに置く。figma-to-codeには複数案件で再現した原因から抽象化した規則・テンプレート・検証器だけを置き、改善グラフもその昇格判断を扱う。

## 2026-07-29: one-shot-fidelity-is-the-product-goal
<!-- loop-log: {"id":"correction-one-shot-fidelity-goal-20260729","kind":"correction","failureClass":"one-shot-fidelity-goal","recurrenceKey":"one-shot-fidelity-goal","action":"strengthen","promotability":"non-promotable","nonPromotableReason":"許可済み検証器には初回忠実度を目的とする判断そのものを再現する負のE2Eが存在しないため。"} -->
- 指摘：figma-to-codeの改善目的を、手法ドキュメントを整えることとして扱った。目的は、Figmaデザインどおりのコードを最初の実装で出せる確率を高めること。
- 今後：正本・テンプレート・検証器の改善は、実際のFigmaページを使うベンチマークで初回実装のFAIL分類と再実測を根拠にする。説明だけの改善で達成とせず、PC/SPの全spec・描画差分・手動修正回数を受入条件として記録する。

## 2026-07-19: component-section-spacing-ownership
<!-- loop-log: {"id":"correction-component-section-spacing-20260719","kind":"correction","failureClass":"component-section-spacing-ownership","recurrenceKey":"component-root-must-not-own-inter-section-spacing","action":"strengthen","ruleTargets":["rules/figma-spec-pipeline.md","rules/loop-execution.md"],"verifierTargets":["templates/verify/figma-gate.mjs","templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘：Figmaコンポーネントを実装するとき、コンポーネントのroot要素に外側のセクション間余白をpaddingとして持たせてはいけない。
- 今後：セクション間余白は親sectionまたはレイアウトwrapperの責務として扱う。コンポーネントのpaddingは、そのコンポーネント内部の余白だけに限定する。Figma上で隣接セクションとの距離として見える余白は、component paddingではなくparent/layout spacingとして記録・実装する。

## 2026-07-19: browser-layout-static-verification
<!-- loop-log: {"id":"correction-browser-layout-static-verification-20260719","kind":"correction","failureClass":"browser-layout-static-verification","recurrenceKey":"figma-layout-static-only-verification","action":"strengthen","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.mjs","templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘：A Figma layout correction was judged complete from source CSS values without comparing the rendered browser output against the Figma reference at the corresponding viewport. Content-driven layout behavior changed the visible geometry.
- 今後：For components with explicit column widths, equal tracks, or fixed geometry, the spec must define the layout mode and each track. Completion requires one PC and one SP checkpoint that compares rendered rectangles for every track and marked sub-element against the fixed Figma reference; source inspection alone is a failure.

## 2026-07-19: owner-correction-log-not-gated
<!-- loop-log: {"id":"correction-owner-correction-receipt-gate-20260719","kind":"correction","failureClass":"owner-correction-log-not-gated","recurrenceKey":"owner-correction-log-not-gated","action":"strengthen","ruleTargets":["rules/figma-spec-pipeline.md"],"verifierTargets":["templates/verify/figma-gate.mjs","templates/verify/figma-gate.e2e.mjs"]} -->
- 指摘：An owner-reported Figma defect could proceed without an immutable project correction-log receipt checked by preflight.
- 今後：Correction scopes require a receipt that binds an entry ID and correction-log hash; preflight rejects a missing or stale receipt.

## 2026-07-18: log-to-rule-feedback-gap
<!-- loop-log: {"id":"correction-log-feedback-20260718","kind":"correction","failureClass":"log-to-rule-feedback-gap","recurrenceKey":"log-to-rule-feedback-gap","action":"strengthen","ruleTargets":["rules/correction-log-promotion.md","rules/self-improvement.md"],"verifierTargets":["tools/figma-log-promote.mjs","tools/figma-log-promote.e2e.mjs"]} -->
- 指摘：保存済みの横断ログがルール改訂へ接続されず再発防止が提案で止まった
- 今後：機械可読な記録から提案、独立レビュー、承認済み限定差分までを同じ昇格契約で追跡する

## 2026-07-18: scope-expansion-during-scoped-fix
<!-- loop-log: {"id":"scope-expansion-during-scoped-fix-20260718","kind":"correction","failureClass":"scope-expansion-during-scoped-fix","recurrenceKey":"scoped-fix-expanded-to-unrequested-process-work","action":"strengthen","ruleTargets":["rules/figma-spec-pipeline.md","rules/self-improvement.md"],"verifierTargets":["tools/figma-scope-lock.mjs","tools/figma-scope-lock.e2e.mjs"]} -->
- 指摘：A focused Figma correction was delayed because unrequested rule and verification infrastructure work was mixed into the same implementation scope.
- 今後：Start an exact-path scope lock before editing; deny out-of-scope paths, block the scope on detected drift, and require a separately owner-approved scope for process work.

<!-- loop-log-schema: v1 -->

## 2026-07-24: OpenType feature tagはFigma実測値を優先する

- 指摘: FV見出しで推測した `halt` / `palt` を指定すると、Figmaと文字幅・位置が一致しなかった。
- 今後: OpenType設定はフォントが対応しているかだけで採用せず、対象Figma text nodeの `fontFeatureSettings` を取得して同じtagを実装する。PC/SPでtagが異なる場合はブレークポイントごとに分ける。
- 確認: Figma Top PC `2153:21943` は `"pwid" 1`、SP `2336:30368` は `"pwid" 1, "halt" 1`。PCのテキスト実測座標は x=121, y=195。

## 2026-07-19
- 指摘：`CSSで対応できる単純な図形・装飾はCSSにする` を、ノイズ・ブレンド・複数レイヤーを含む複合背景へ拡張してはいけない。
- 今後：複合背景はFigmaのレイヤー・effect・blend modeを先に確認する。CSSで同一の合成結果を再現できない場合は、CSS再現を試行せず、Figmaの対象ノードをPC/SPごとに書き出したアセットを使用する。

## 2026-07-19: FigmaグループとHTML構造の一致
- 指摘：既存HTMLを変えないことを優先し、Figmaの見出しグループをHTMLへ反映せず、親`gap`と子の負`margin`で帳尻を合わせた。
- 今後：Figma Auto LayoutグループとHTML親子構造の対応を編集前に確認する。不一致ならCSS補正を禁止し、HTMLを先にFigmaの構造へ合わせる。レイアウト目的の負`margin`、一律`gap`を子ごとに打ち消す指定は使用しない。例外はFigmaに明示された重なりだけとし、node ID・PC/SP条件・根拠をSCSSコメントとspecへ残す。

## 2026-07-18: Figma差異指摘の保存先
- 指摘：Figmaどおりでないという個別指摘と、案件横断のFigma実装失敗が同じ保存先に混ざると、固有の事実と再利用可能な規則のどちらも追跡しづらい。
- 今後：対象ページ・Figma node-id・固有の文言、寸法、HTML、アセット、実測値は案件側 `MyBrain/rules/corrections.md` に保存する。推測実装、全要素照合漏れ、コンポーネント未流用、PC/SP検証漏れなど、案件をまたいで再発する失敗だけをこの `rules/corrections.md` / `mistakes.md` に保存する。

## 2026-07-18
- 指摘：所要時間超過や検証の重複を、オーナーが毎回指示してからルールへ直す運用では再発防止にならない。
- 今後：Figma scopeのclose後に事実駆動の自己改善器を実行し、既知の安全な案件ローカル制御は自動適用する。正本ルールや検証器の変更が必要なものは根拠付き提案として独立レビューとオーナー承認へ渡し、勝手に緩和・書換えしない。

## 2026-07-18
- 指摘：Figmaが返したSVGをそのまま採用し、CSSで同一に再現できる単純な赤丸まで画像化した。
- 今後：FigmaのSVGは採用候補として扱う。実装前にCSSで形状・色・配置・状態を同一に再現できるか判定し、再現可能ならCSSを採用する。CSSで再現不能な固有ベクター、ロゴ、イラスト、質感だけをFigma書き出しアセットとして使う。

## 2026-07-18
- 指摘：Figma照合をコーディング時の工程として定めているにもかかわらず、証跡不足・未検証scopeを理由にcommit / push / deployを止める記述が残り、Git操作時に不要な検証を行う余地を作った。
- 今後：Figmaのpreflight・checkpoint・section-close・closeはコーディング反復内だけで実行する。Git hook、commit、push、deployでは実行・再実行・完了条件化しない。未検証scopeは「Figma実装完了」とは報告しないが、Git操作を止める条件にはしない。（2026-08-29 更新：最後の一文は「Figma照合をhookで実行しない」の意味に限る。発行済み受領証とファイルhashの照合だけでcommitを止めることは許可する。本ファイル先頭の 2026-08-29 `git-hook-scope-ambiguous` を優先する）

## 2026-07-18
- 指摘：Codexが実装役でもFigmaと実ブラウザ出力の比較・差分修正を省略し得る。完全一致を目指す工程が遅すぎ、重複した確認が混在する懸念もある。
- 今後：実装役はエージェントを問わず、各コンポーネントをFigma/specとCDP実測・必要な描画差分で比較し、FAILなら原因診断→最小修正→同一checkpoint再測定をPASSまで繰り返す。テンプレートの各工程には唯一の目的・入力・終了条件を定め、同じ証跡を二度要求する工程は置かない。

## 2026-07-18
- 指摘：CodexがFigma実装で既存コンポーネントを調査・再利用せず新規コードを作り、Figmaと公開ページの比較も省略している。
- 今後：実装前に既存コンポーネントと実使用ページDOMを対応表で照合し、再利用可否を根拠付きで記録する。公開を伴う変更は公開URLでFigma/specとの照合を完了するまで「公開完了」と報告しない。

## 2026-07-18
- 指摘：Figma差分の確認を要素ごとの目視・個別再実行へ分割すると、確認回数が増え、同じscope内の未確認や修正による回帰を残す。
- 今後：対象checkpointはPC/SPの全可視要素を1つの集約specに固定し、同一の全件検証コマンドで測定する。FAILはSPEC / LAYOUT / VISUALに分類して同じscope内で一括修正し、同じ全件コマンドで再測定する。固定待機・未対応の画像差分・別ブラウザプロセスへの分割を含む検証ツールは、手作業で補わず、preflight前に改善する。詳細は `rules/figma-spec-pipeline.md` のフェーズ3Aを正本とする。
