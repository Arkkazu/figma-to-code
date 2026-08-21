# P-3 R5 ordinal 3 — 外部OS隔離・読み取り専用 capability probe 計画（草案）

状態: 草案。実行手順、runtime設定、launch承認ではない。

## 目的と境界

このprobeは、実装roleの前に、外部OS隔離runtimeが次の限定された可視性を満たすかを機械観測するためのものです。

- implementation identityに非runtimeデータとして可視なのは、4 attachmentだけです。persistent outputは同identityにmount・ACL・pathとして露出しません。
- 入力は個別にread-onlyです。persistent outputは開始時空で、別identityのfixed exporterだけが単一固定archive pathへatomic createできます。
- global `AGENTS.md`、`CLAUDE.md`、`WORKFLOW.md`、skills、plugins、MCP、connector、browser、履歴、host project、Git、peer role home、comparison/coordinator recordは見えません。
- probe中は入力・scratch・persistent output・runtime設定を一切変更しません。implementation identityからpersistent outputへのread/writeは拒否されなければなりません。

OSと実行runner自体は、実行に必要な最小read-only runtime baseとして別途列挙します。このbaseは「4 attachment以外の作業データ」ではありませんが、host側の任意パスやuser profileを露出してはなりません。

このprobeのPASSはP-11を判定しません。`P-11: NOT_AUTHORIZED` を固定します。role delivery、role launch、implementation、return check/apply、site/lifecycle、browser/Figma測定も承認しません。

## 必要な信頼境界

| 実行者 | 許可する役割 | 許可しない役割 |
| --- | --- | --- |
| 外部host/hypervisor verifier | runtime作成、mount/ACL収集、trace収集、evidence署名 | roleにevidence保存先やhost pathを露出すること |
| 固定probe binary | metadata/access/denial検査、stdoutへの最小結果出力 | input内容の抽出、任意コマンド実行、ファイル書込み |
| fixed exporter（coordinator-controlled） | scratchの固定archiveを検証し、空のpersistent outputへ単一固定名でatomic create | implementation identityとしての実行、outputの列挙・読取、追加pathへの書込、validation失敗時の出力 |
| implementation role | probe完了後に別承認で起動し得る。4 attachmentをreadし、ephemeral scratchだけへwrite | probeの実行、host証跡の読取、runtime設定変更、persistent outputへのread/write |

固定probe binaryはrole promptやagentではありません。verifierがhash固定したプログラムとして、実装roleより前に実行します。証跡はguest内ではなく、host/hypervisorの専用evidence storeへ収集します。

## 実施前チェックリスト

- [ ] 外部runtime方式（専用VM、VM isolation container等）とhost/hypervisorのログ取得方法を文書化した。
- [ ] runtime image/base snapshot、runner、fixed probe、verifierの各versionとSHA-256を固定した。
- [ ] 各入力attachmentの相対パス、regular-file種別、byte数、SHA-256だけを含むinventoryを作成した。内容はevidenceへ複製しない。
- [ ] 4 attachmentは個別read-only mountまたは同等ACLで提供した。親directoryを提示する場合、余剰entryが無いことをhost側で証明した。
- [ ] 指定persistent outputは空であり、implementation identityにはread/writeとも不可、固定exporterだけに単一固定pathのatomic create権限があることをhost側で検証した。
- [ ] scratchが必要なら、host-backedでないephemeral filesystemであること、runtime終了時に破棄されることを固定した。
- [ ] host folder、drive、clipboard、redirected device、host socket、user profile、shared cache、persistent diskを外した。
- [ ] 実在する禁止path一覧をverifierだけが保有し、guestには最小のnegative testを固定probe経由で渡す設計にした。
- [ ] guestのenvironment、mount、ACL、reparse point、process、socket、network policyを取得するcollectorを固定した。
- [ ] evidence bundleの保存先はguest/outputとは別であり、role identityから到達不能であることを検証した。

## 読み取り専用probeの手順

1. verifierが新しいnonceを生成し、runtime作成要求、image digest、mount/ACL manifest、runner/probe hashesをnonceに束縛します。
2. host/hypervisorが新しいruntime instanceを作成し、作成時刻・instance ID・base snapshot・persistent disk不在・host share不在を記録します。既存sessionのresumeは不合格です。
3. roleを起動する前に、verifierがguest外からmount table、ACL、directory entry、reparse/junction/symlink、input hash、空のpersistent output hashを採取します。implementation identityのmount/ACL viewにpersistent outputが無いことも採取します。
4. fixed probeを最小権限のimplementation identityで起動します。probeは次だけを行います。
   - 4 attachmentのmetadata/read-only access modeを読む。
   - 許可された4 inputへのread accessを確認し、persistent outputへのlist/read/write/resolve/traverseがすべて拒否されることを確認する。
   - global instructions、skills、plugins、MCP/connector/browser設定、history、project/Git、peer/coordinator pathをnegative probeする。
   - environment、process、socket、mount/ACL、filesystem access traceをhost側collectorへ出力する。
5. fixed probeは入力内容、scratch、persistent output、runtime configurationを変更せず終了します。probe前後でinput hash一致、implementation identityのpersistent-output denial、空のpersistent outputを再測定します。
6. verifierがruntimeのmount/ACL、runner/probe hash、process tree、network policy、implementation-identity trace、fixed-exporter UID/ACL境界を再測定し、全artifactをnonce付きbundleへ署名します。fixed exporterはrole launch後の別段階でのみ実行し、scratchの固定archive以外をreadできず、persistent outputの単一固定名以外をwriteできません。
7. evidence validatorがschemaの全項目を検証します。不足、矛盾、self-reportだけの根拠、probeの副作用、または禁止surfaceへの到達が1件でもあれば`FAIL`です。
8. PASSの場合でもruntimeをlaunch可能とは扱いません。後続の別authorizationが同じnonce、runtime configuration hash、topology manifest hash、runner hash、post-probe recheck hashを再束縛した場合だけ、role launchを検討できます。

## negative probeの判定

禁止pathはhost側に実在することをhost witnessで証明します。guest側結果が単に`not found`だった場合、それだけでは不十分です。host witnessとmount namespace/ACLの証跡を組み合わせ、guestにhost identityがmapされていないことを示します。

次はすべて不合格です。

- guestのimplementation identityから禁止pathまたはpersistent outputをlist、read、write、resolve、traverseできる。
- `HOME`、`USERPROFILE`、`APPDATA`、`CODEX_HOME`、working directory、PATH、argv、service config、drive/UNC mappingのいずれかが禁止surfaceへ解決する。
- plugin host、MCP/connector、browser、shell integration、extra agent process、許可外child processが実行中または設定済みである。
- implementation identityにpersistent writable locationがある、persistent outputをread/writeできる、fixed exporterが単一固定archive path以外へwriteできる、host-backed temp、reparse/junction/symlink/hard-link/overlay escapeがある。
- networkがdeny-by-defaultでない、またはrole identityから到達可能なlistener/endpointがある。
- runtimeがfreshでない、またはprobe前後で構成が変わる。

## evidence bundleの最小構成

- sealed runtime manifestとそのSHA-256
- verifier/runner/probeのpath、version、SHA-256、command hash
- external runtime instance event、image/base snapshot digest、freshness event
- attachment inventory hash、input hash before/after、persistent output hash before/after、implementation-identity output-denial probe、fixed-exporter UID/ACLとatomic-create証跡
- mount table、ACL、reparse/symlink、environment、process、socket、network policyのbefore/after hash
- host-existence witness、guest negative-probe transcript、filesystem access trace
- post-probe configuration recheck、nonce、bundle signature/MAC
- 判定（`PASS`/`FAIL`）と、常に`P-11: NOT_AUTHORIZED`

role stdout、roleが作成したmanifest、owner self-reportは補助情報にはなっても、隔離の機械証明の代替にはしません。

## 実行可否

この草案は外部OS隔離runtimeが実在し、host/hypervisor証跡を取得できる場合だけ実施できます。現行host内のCodex nested runtime、workspace内のdirectory分離、`--ephemeral`、`--ignore-user-config`、設定上のplugin無効化は、このschemaの外部OS隔離証跡を満たしません。
