---
type: rule
status: permanent
date: 2026-09-06
topic: 自己保護する統制の修理経路
tags: [guardrail, codex, recovery, verification]
---

# 自己保護する統制の修理経路

## この規則が要る理由

`tools/codex-edit-guard.mjs` は `protectedPath` に自分自身を含めており、**Codex セッションからガード自身を編集することを禁止している**。これは設計であって欠陥ではない。しかし裏返すと、ガードに欠陥が入った瞬間に、そのガードの下で動くエージェントは次のすべてを失う。

- 読み取り（原因調査ができない）
- `workflow-preflight` の実行（`CLAUDE.md` の必須手順を満たせない）
- ガード自身の編集（自力で直せない）

2026-09-06 に実際にこうなった。E2E 18群が全部 PASS したまま、実機では Codex の全操作が停止した。回復できたのは、たまたまこのフックの対象外である別のクライアントが居合わせたからで、**設計された経路ではなかった**。この規則はその穴を塞ぐ。

## 原則

1. **修理は迂回ではない。**ガードの下にいるエージェントに修理権限を与えて解決しない。`protectedPath` を緩めない。
2. **修理は外側から行う。**ガードの対象でないクライアント、またはフックを止めたオペレーター端末から行う。
3. **武装（arm）には合格が要る。**自分の許可経路を通せないガードは、そもそも設置させない。
4. **拒否側だけの検証で「効いている」と判断しない。**全部拒否するガードは、全部許可するガードと同じくらい壊れている。

## P1. 検出 — `selftest`

フックも binding も scope lock も要らない。壊れたガードの上でも動く。

~~~powershell
node C:/AI/figma-to-code/tools/codex-edit-guard.mjs selftest
~~~

正規の許可経路（`read` / `list` / `preflight` の固定reader、および reader が実際に実行できること）と、拒否されるべき経路（任意コマンド、コマンド連結、login要求、未分類ツール、未bind編集、ガード自身の編集）を一括で判定する。全件一致でのみ `passed: true` / exit 0 を返し、1件でも外れれば **exit 3** と不一致の一覧を出す。

**実行すべき時点**は3つある。ガードを変更した直後、`/hooks` で信頼・有効化する前、そして「Codexの様子がおかしい」と感じた時点。

## P2. 武装の関門 — `install`

`install` は `selftest` を先に実行し、`passed: false` なら `.codex/hooks.json` を書かずに拒否する。exit 0 のガードしか設置できない。

> [!warning] `/hooks` の信頼ハッシュはガード本体を含まない
> ✅ 実測（2026-09-06）：ガード本体を書き換えても `/hooks` の Trusted 表示は変わらず、フックは動き続けた。信頼ハッシュが覆っているのは `.codex/hooks.json` のフック定義であって、そこから呼ばれるスクリプトの中身ではない。
> つまり**「信頼済み」はガードを査読した証拠にならない**。ガード本体を変えたら、信頼状態に関わらず `selftest` と E2E を通し直す。

## P3. 遮断 — フックを止める

`selftest` が落ちた、またはエージェントが操作不能になったときは、まずフックを止める。**迂回ではなく、正規の停止手段である。**

- 通常端末（VS Code 拡張ではない CLI）で `/hooks` を開き、`Project config` と表示されている当該フックをトグルで無効化する。無効化は `~/.codex/config.toml` の `[hooks.state.'<hooks.jsonの絶対パス>:pre_tool_use:0:0']` に記録され、プロジェクトの `.codex/hooks.json` は変更されない。
- 反映には**アプリ側の再読み込みが要る**。⚠️ 実行中のセッションへ即時反映されるかは未確認。

## P4. 修理 — 誰が直すか

次のいずれか。**ガードの下にいるエージェントは修理役になれない。**

- **A：対象外のクライアント。**このフックは Codex の PreToolUse であり、他のクライアントには適用されない。P3 を経ずに直せるため、ガードを止める時間帯が発生しない。**既定はこちら。**
- **B：P3 でフックを止めたオペレーター端末。**A が使えないときのみ。止めている間は統制が無い状態なので、修理以外の作業をしない。

## P5. 再武装 — 戻す前の必須3件

1. `node tools/codex-edit-guard.mjs selftest` が exit 0
2. `node tools/codex-edit-guard.e2e.mjs` が exit 0
3. **変異試験**：加えた検査を1つ無効化して、E2E が exit 1 になることを確認してから復元する。落ちなければ、その検査は別の理由で通っているだけであり、検査になっていない

3件が揃ってから P3 で止めたフックを戻す。`.codex/hooks.json` を変更していなければ再信頼は不要（P2の警告を参照）。

## P6. 記録

修理のたびに `MyBrain/reports/` へ、検出の経緯・原因・実測ログの根拠・P5の3件の結果を残す。ガードの下にいるエージェントは未bindのため報告書を書けないので、オペレーターが対象1ファイルだけを `bind` する。

~~~powershell
node C:/AI/figma-to-code/tools/figma-scope-lock.mjs begin <scope.json> <state.json>
node C:/AI/figma-to-code/tools/codex-edit-guard.mjs bind C:/AI/figma-to-code <session-id> <state.json>
~~~

`<session-id>` が不明なときは、誤った値で bind してよい。拒否理由が `No binding for session <実際のid>` に変わって正解が表示されるので、その値で bind し直す。

## 関連

- 欠陥の詳細と原因：[[mistakes]] 2026-09-06
- スコープロックの契約：[[figma-scope-lock]]
- ガードの仕様：`tools/codex-edit-guard.md`
