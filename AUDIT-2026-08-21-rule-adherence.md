# 独立監査 2026-08-21 — 「Codexがルールを無視してデザインどおりに書かない」の原因調査

- 実施: クラウドセッション（`CLAUDE_CODE_REMOTE=true`）
- 範囲: `WORKFLOW.md`「クラウドセッションでの実行範囲」が許可する**独立レビュー（批評のみ）と静的整合確認**に限定
- 正本（`rules/` `spec/` `templates/` `tools/`）は一切変更していない
- 未実施: Figma実物照合、実ブラウザ実測、案件側 `MyBrain/` を根拠とする判断、`corrections.md` / `mistakes.md` への追記、昇格

結論から言うと、**問題はCodex側ではなくこのリポジトリ側にある。**規則の中身は妥当だが、規則が「Codexのセッションに届く経路」「読み切れる分量」「守らないと止まる強制力」の3つを、いずれも満たしていない。加えて、この問題を直すはずのループが別問題へ丸ごと吸い込まれている。

---

## A. 規則がCodexに届く経路が無い（最大の原因）

Codexが自動で読み込むのは `AGENTS.md` のうち **cwd とその祖先ディレクトリ、およびグローバル `~/.codex/AGENTS.md`** だけである。

- `STATE.md` の実測によれば、案件の作業ディレクトリは `C:/docker-project/rpa-technologies/...` にある。
- `C:\AI\figma-to-code` はその祖先ではない。**したがって本リポジトリの `AGENTS.md` は、案件でCodexを起動しても自動読込されない。**
- `README.md` が示す4段チェーン（`.codex/AGENTS.md` → vault → web-development → 本リポジトリ）のうち、自動で効くのは1段目だけである。2〜4段目は「1段目が明示的に転送している」ことに全面依存する単一障害点であり、本リポジトリからは検証も強制もできない。

さらに、届いた場合ですら本文が無い。

- `AGENTS.md` は11行のポインタで、規則本文が0行。`WORKFLOW.md` へ誘導し、そこから7ファイル、さらに `corrections.md` / `mistakes.md` へと**自発的に辿ることを期待する設計**になっている。
- 「読まなければ何も起きない」構造なので、規則は事実上ぜんぶ任意読みである。読み飛ばしを検知する仕組みは本リポジトリ側に無い。

---

## B. 着手前の必読量が実行不可能な規模になっている

| 対象 | 実測 |
| --- | --- |
| `WORKFLOW.md` が必読とする1〜4（本リポジトリ分のみ） | 971行 |
| `rules/figma-mcp-implementation.md`「着手前に必ず読む」が追加する分 | 658行（corrections 425 / mistakes 157 / レビュー基準） |
| `rules/figma-spec-pipeline.md` 単体 | 421行 / 61KB |
| 上位2層（vault / web-development）を含む総量 | `figma-spec-pipeline.md` 自身が「全層で約2,000行」と記載 |
| フェーズ0の固定チェックリスト | **29項目** |

1行でも編集する前に、spec / node map / DOM対応表 / component manifest / component decision manifest / page coverage の**6種の成果物**が揃っていることが要求される。

これは規律の問題ではなく容量の問題である。**「読んだことにして着手する」経路が最も安く、しかもそれを検出する手段がこのリポジトリ側に無い。**`figma-spec-pipeline.md` 自身が「ルールを参照情報として読むだけでは工程が守られないことが自己監査で実証された（2026-07-09）」と書いており、対策として `preflight` に必読の絞り込み出力を足しているが、その `preflight` 自体が次のCで起動しない。

---

## C. 強制力（gate）が案件側にしか無く、その配送が壊れている

- `figma-gate.mjs` ほか20以上のファイルを案件 `MyBrain/verify/` へ**手作業でコピー**する配布方式。同期スクリプトは本リポジトリに存在しない（`ls tools templates/verify | grep -iE 'sync|install|bootstrap|copy'` は0件）。
- 配布物の機械可読な正本として `C:\AI\MyBrain\manifest.json` と `node C:/AI/MyBrain/bootstrap.mjs --check` を指しているが、**共通Vaultは 2026-07-29 に `C:\AI\vault` へ改名済み**（`rules/mistakes.md:36` が明記）。旧パスのまま残っている運用記述は5箇所:
  - `templates/LOOP.md:11`（案件LOOPのコピー手順そのもの）
  - `templates/verify/README.md:85` / `:280`
  - `templates/verify/P3-P11-APP-SERVER-SPIKE.md:98` / `:104`
- つまり**「コピー漏れ・世代差を検出する唯一の機械検査」が、存在しない可能性の高いパスを指している。**2026-07-27 に実際に起きた「正本と案件側コピーの世代差を実装欠落と誤診断した」失敗の再発防止が、機構として効いていない。
- ゲートの起動は `npm run figma:gate -- preflight` 前提。本リポジトリに `package.json` は無く、案件側に script が無ければゲートは起動しない。**ゲート未実行のまま実装を進める経路が開いたままである。**

---

## D. 最も再発している失敗クラスの学習が完全に停止している

`learning/log-promotions/proposals/` の状態（実測）:

| 再発キー | 件数 | status |
| --- | --- | --- |
| `unverified-figma-value` | **5件** | **全件 `pending-review`** |

`unverified-figma-value` は「Figmaから取得していない推測値をspec・検証基準・実装に使う」失敗クラスであり、**オーナーの今回の指摘（デザインどおりに書かない）の本体そのもの**である。

- 2026-07-30 の監査 [75] 時点で4件・全件 `pending-review`。3週間で1件増え、**昇格は0件**。
- `spec/06-self-improvement.md` の停止条件「同じ提案が3回連続で未解決」に該当済みだが、停止もエスカレーションもされていない。
- 各提案の `Required change` は `rules/figma-spec-pipeline.md` の強化と `figma-gate.mjs` / `figma-gate.e2e.mjs` への負のE2E追加を要求している。**ルール強化と検証器強化がこの1点で全部詰まっている。**

---

## E. ループの投入先が製品目標からずれている（根本原因）

- オーナー訂正 2026-07-29「one-shot-fidelity-is-the-product-goal」は、**実Figmaページのベンチマークにおける初回実装のFAIL件数・手戻り回数**を受入条件と定めている。
- `learning/` 配下のベンチマーク結果は **0件**（`find learning -iname '*benchmark*' -o -iname '*fidelity*'` → 0）。
- `STATE.md` の「現在地」も自認している: 「原因1（効果測定の不在＝P-3）は…**実Figma入力指定と実測値が0件のため未解消**」。
- 一方で `STATE.md` のイテレーション [139]〜[194] は、P-3 clean-room protocol、P-11 authorization、role packet、return allocation v2 authority、SHA-256ハッシュ鎖の設計・批評・再批評にほぼ全量が費やされている。P-11 は [170] で「現行公開APIでは到達不能（BLOCKED）」と判定され、そこからさらに代替設計が続いている。
- `tools/` の実測: 全77ファイル・1.7MB のうち、**`r4-` が23件、`r5-` が49件の計72件**が P-3 / P-11 系の使い捨てスクリプトである。Figma実装に直接効くのは `figma-log-promote`（2）/ `figma-scope-lock`（2）/ `codex-task`（1）の**5件のみ**。`README.md` は `tools/` を「案件横断の訂正ログをLoop Engineering提案へ変換する実行器」と定義しており、実態はこの定義から大きく外れている。

**「AIがデザインどおりに書かない」を直すはずのループが、その効果を測るための隔離証明という別問題に丸ごと吸い込まれ、忠実度は一度も測定されていない。**A〜Dが放置されているのはこれが理由である。

---

## F. 静的整合の不良（機械検査で検出）

1. **入口2枚で必読集合が違う。** `WORKFLOW.md` は `rules/figma-scope-lock.md`（D-012スコープロック）を必読に含むが、`README.md` の必読リストには**欠落**している。
2. **実在しない相対パス参照が19件。** うち `rules/scss.md` `rules/breakpoints.md` `rules/accordion.md` `rules/video-embedding.md` は web-development 側、`spec/06-self-improvement.md` `spec/07-graph-orchestration.md` `templates/LOOP-spec-dev.md` `templates/LOOP-implementation.md` は loop-engineering 側のファイルを、**本リポジトリ相対に見える書式**で書いている。読み手が本リポジトリ内を探して見つけられない。
3. **`WORKFLOW.md` が禁じた案件固有値が `rules/` に残存。**
   - `rules/corrections.md:425` — 実node-id `2153:21943` / `2336:30368` と実測座標 `x=121, y=195`
   - `rules/corrections.md:23` — 実node-id `3288:45292`
   - `rules/mistakes.md:94,100,107` — 案件名「OPEN」
4. **`README.md` の版表記が実態と乖離。** 「版: 0.3.1 / 最終更新: 2026-07-18」だが `STATE.md` は 2026-08-12 まで更新されている。
5. **E2Eの実FAIL 1件。** `templates/verify/p3-role-packet.e2e.mjs` が `Owner Decision J record cleanRoomAuthorizationStableJsonSha256 differs from the bound comparison authorization` で失敗する。ブラウザ必須の6本（accessibility / asset / motion / gate-browser-batch / p3-page-provider / fidelity-benchmark）とクラウド未同期の1本（checkpoint-diff）は環境要因のため別扱い。

---

## 改善提案（優先順）

いずれも正本の変更を伴うため、着手にはオーナー承認が必要。ローカルセッションで実施すること。

**P-A（最優先・配送の修復）** — `AGENTS.md` に規則本文を持たない設計を改め、**着手前ゲートだけは本文としてAGENTS.mdに直書きする**。具体的には「Figma URLを受け取ったら、fileKey/nodeIdの宣言・spec作成・preflight PASSの3点を報告してからでないとソースを編集しない」の数行。あわせて、案件リポジトリ側に `AGENTS.md` を1枚置き、そこから本リポジトリを参照させる（祖先チェーンに乗せる）。**これをやらない限り他の改善は届かない。**

**P-B（ゲートの実効化）** — `C:\AI\MyBrain` → `C:\AI\vault` の旧パス5箇所を修正し、`bootstrap --check` が実際に走ることを実測で確認する。あわせて案件側 `package.json` に `figma:gate` script が無い場合に**ゲート未導入として停止する**手順を明記する。

**P-C（滞留の解消）** — `unverified-figma-value` の5提案を1件に統合し、負のE2E → 独立レビュー → オーナー承認まで通す。`spec/06-self-improvement.md` の停止条件に既に該当している以上、他作業より先に処理する。

**P-D（ループの再照準）** — P-3 clean-room / P-11 系の作業を**明示的に凍結**し、実Figmaページ1枚で初回実装のFAIL件数を測るだけの最小ベンチマークに切り替える。隔離証明が無くても、同一人が同一手順で測った数値は「前回より減ったか」の判定には十分機能する。完全な比較契約を待つ限り、忠実度は永久に0件のままになる。

**P-E（分量の削減）** — 29項目のフェーズ0チェックリストを、**機械検査で代替できる項目**と**人間/AIが宣言すべき項目**に分ける。前者は `preflight` の出力に寄せ、AGENTS.mdに残す宣言項目は5項目以内にする。

**P-F（整合の修正）** — F節の1〜4を機械的に修正する。`rules/` の案件固有値は案件側 `MyBrain/rules/corrections.md` へ移すかプレースホルダー化する。
