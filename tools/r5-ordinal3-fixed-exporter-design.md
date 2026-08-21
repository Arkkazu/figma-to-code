# P-3 R5 ordinal 3 — fixed exporter 最小安全設計（草案）

状態: workspace-only 草案。external publication、role delivery、role launch、implementation、return check/apply、site/lifecycle、browser/Figma、P-11 のいずれも承認しない。

## 1. 固定する境界

implementation identity の mount / ACL / PATH / environment / argv / process tree から、persistent output と host exporter は**存在しないもの**にする。単に output directory を mode `000` にするだけでは不足である。

- role が読める非runtimeデータは `input/assignment.json`、`input/references/pc-first-view.png`、`input/references/sp-first-view.png`、`return-authority.json` の4 regular fileだけである。
- role が書けるのは guest 内の ephemeral `/p3/scratch` だけであり、提出可能な名前は `/p3/scratch/return.ustar.tar` だけである。
- candidate の `/p3/output/return.ustar.tar` は role namespace に mount・directory entry・ACL として置かない。これは exporter 側だけの論理 destination を表す。host output root と実パスは role prompt、attachment、guest environment、process argv、socket、trace に出さない。
- guest に `sbx`/Docker client、Docker socket、sandbox control socket、host credential、host shell integration、exporter binary/configuration/evidence store を置かない。implementation identity は exporter を起動・再起動・引数指定できない。

## 2. 二つの host-only identity

| identity | 読取 | 書込 | role からの可視性 |
| --- | --- | --- | --- |
| coordinator-controlled fixed exporter | sealed sandbox ID、固定guest source、private spool、pinned validation adapter | private spool、固定 output filename | 不可 |
| coordinator verifier | topology/ACL/process/trace と exporter evidence | evidence store のみ | 不可 |

exporter は implementation identity と異なる OS identity で実行し、sealed launch manifest からだけ値を得る。role authored data、role stdout、role supplied path、role supplied destination は exporter の引数又は設定に使用しない。

## 3. sealed exporter manifest

role に見せない coordinator-only manifest を、runtime creation 前に byte-pin する。最低限の field は次のとおりである。

```json
{
  "sandboxInstanceId": "host-controlled canonical identifier",
  "guestSource": "/p3/scratch/return.ustar.tar",
  "privateSpoolRoot": "coordinator-only, output root の外",
  "outputRoot": "fresh empty coordinator-controlled directory",
  "outputFilename": "return.ustar.tar",
  "expectedArchivePolicySha256": "pinned validation adapter policy",
  "outputInventoryBeforeSha256": "strict empty inventory",
  "roleTerminationReceiptSha256": "all implementation-identity processes stopped before copy",
  "exporterInvocationSha256": "fixed command/configuration"
}
```

`sandboxInstanceId` は canonical grammar に制限し、exporter が組み立てる guest source は常に `<sandboxInstanceId>:/p3/scratch/return.ustar.tar` とする。任意 source / destination / option を受ける CLI は fixed exporter に含めない。

## 4. 実行順序

1. verifier が attachment、empty output、ACL、reparse point、runtime mount、implementation-identity output denial を再測定する。output root は `return.ustar.tar` を含めて空でなければ fail である。
2. supervisor が implementation role と全 child process の終了を記録し、再実行経路を閉じる。runtimeを終了しなければ copy できない方式では、role process を再開せずに copy できることを manager event と process trace で証明する。role が source を変更し得る間は export しない。
3. exporter は新規の coordinator-private spool directory を作る。spool は output root の外、role namespace の外、同一 host identity のみが到達可能な場所である。
4. exporter だけが `sbx cp <sandbox>:/p3/scratch/return.ustar.tar <private-spool-file>` を起動する。`sbx cp` は直接 output root を destination にしてはならない。実測 help は既存 destination の no-overwrite/atomic 性を保証していないためである。`sbx exec` も使用しない（help 上、stopped sandbox を起動し得る）。
5. copy 後、exporter が private spool file を `lstat` し、regular file、non-reparse/non-symlink、expected single name、size limit、stable SHA-256、private ACL を確認する。失敗時に output root へ何も作らない。
6. byte-pinned validation adapter が spool の immutable bytes を検査する。PASS まで output create は不可である。
7. adapter PASS 後だけ、fixed exporter が private spool と同一 volume にある空 output root へ `return.ustar.tar` を atomic no-replace create する。Windows 実装は `CreateHardLinkW(output/return.ustar.tar, privateSpoolFile)` のような **destination exists で失敗する** fixed primitive を使い、その後 spool link を削除する。`rename` / `Move-Item` / `sbx cp` の既存 destination を置換し得る動作は使わない。最終 archive は `nlink=1` の regular file であることを再測定する。
8. verifier が final output inventory と ACL/reparse/hardlink 状態を再測定し、output root が regular `return.ustar.tar` 1件だけであることを確認する。private spool は output inventory の外で削除する。失敗時に raw archive を evidence に保存しない（hash、size、validator error、trace だけを保存する）。

atomic claim 後に spool unlink 又は final inventory が失敗した場合、exporter は成功を報告しない。既に created output は自動 delete/replace せず、別の coordinator recovery authority まで immutable forensic state とする。

## 5. validation adapter の委譲境界

adapter は exporter と別の byte-pinned host executable/module とする。adapter policy は少なくとも次を検査する。

- non-empty、512-byte aligned、plain `ustar\0` / version `00`、有効 header checksum、two zero end blocksだけを許す。
- regular file entries だけを許し、directory、symlink、hard link、special、PAX/GNU extension、linkname、duplicate/case-fold collision、non-zero padding、path traversal を拒否する。
- `return-manifest.json` を必須にし、sealed export policy の handoff ID、delivery sequence、protocol SHA-256、input staging SHA-256、component、exact archive entry set、各 entry SHA-256 と一致させる。
- expected entry set は sequence 1 の frozen create scope（`return-manifest.json`、`site/index.html`、`site/styles.css`）から coordinator が sealed manifest に固定する。role はこの policy を変更できない。

この adapter は structural/export policy の検査だけを担い、actual worktree を読む `p3-role-return.mjs --check` 又は `--apply` を呼ばない。後者は別 authorization 下の後続 coordinator action であり、exporter PASS からは一切導かれない。

## 6. strict inventory と fail-closed 条件

output root の inventory は before/after とも、entry relative path、file type、byte length、SHA-256、ACL、reparse/junction/symlink/hardlink status を canonical JSON で hash 化する。

- before: root 自体のみ。entry 0件、output archive 不在、role identity の list/read/write/traverse は全拒否。
- after PASS: `return.ustar.tar` の regular file 1件のみ。destination が pre-existing、additional entry、link/reparse、ACL逸脱、host path漏えい、hash mismatch、validator non-PASS、termination receipt欠落のいずれかは fail。
- exporter の allowlist は read=`guest source` と `private spool file`、write=`private spool file` と `output/return.ustar.tar` のみである。exporter の最小 stdout receipt は verifier が取得し、evidence store への書込みは verifier identity だけが行う。

evidence は nonce、sealed manifest hash、`sbx cp` invocation hash/exit result、spool hash、adapter binary/policy/transcript hashes、atomic-create transcript、before/after inventories、ACL/UID evidence、role termination receipt、scratch destruction receiptを含む。host absolute paths は evidence store 内にのみ置き、role-visible artifactには入れない。

## 7. Docker Sandboxes API から得た限定事実

2026-08-15 の `sbx cp --help` は host と sandbox 間のコピーを示すが、atomic create 又は no-overwrite を約束しない。従って `sbx cp` は guest→private spool の転送に限定する。

同日の `sbx exec --help` は stopped sandbox を開始すると明記する。exporter は `sbx exec` を使わず、role終了後に guest command を起動しない。

同日の `sbx create --help` と `sbx create shell --help` は primary `PATH` を host workspace とし、通常は bind mount、`--clone` は host Git repository の private in-container clone と git-daemon を使う方式と示す。従って current `sbx create … PATH` surface だけでは、candidate が要求する「guest-only / non-host-backed / runtime destruction とともに消える writable scratch」を証明できない。`--clone` も Git / git-daemon を導入するため、このcandidateの role-visible Git/host route禁止には適合しない。

この文書の exporter flow は、外部runtimeが別途 guest-only scratch と role-unreachable host exporter channel を machine-verifiably 提供できる場合に限る。Docker Sandboxesの現行help surfaceでその方式が確認できるまで、actual ordinal-3 delivery/launch は fail-closed とする。

この設計は sandbox create、daemon、run、cp、exec を実行していない。runtime の実機 proof は別の owner-approved capability probe でのみ行う。
