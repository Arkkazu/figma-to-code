# R5 ordinal 3 Docker Sandboxes capability probe — failed gate

Scope: synthetic probe only. No P-3 attachment, role home, coordinator record, worktree, or site was mounted or changed.

## Probe construction

- Docker Sandboxes CLI: `sbx` v0.38.0.
- Sandbox: `p3-isolation-capability-v1` (stopped after measurement; retained only as synthetic probe configuration).
- Agent template: `docker/sandbox-templates:codex-docker`.
- Primary RW mount: an initially empty synthetic output directory.
- Extra RO mount: four synthetic, non-P-3 regular files.
- Requested controls: `--no-share-skills` and scoped `--deny-network "**"`.

## Measurements

| Check | Result |
| --- | --- |
| Synthetic attachment write | Denied with `Read-only file system` |
| Host Vault path (`/c/AI/vault`) | Absent |
| Shared-skills mount entry | Absent from `/proc/self/mountinfo` |
| Direct HTTPS egress (`curl --noproxy '*'`) | Denied |
| Proxy HTTPS egress to `example.com` (`curl --fail-with-body`) | Denied with proxy HTTP 403 |
| Scoped `**` deny rule | Enforced; policy log recorded a forward-proxy deny for `example.com` |
| Daemon policy check for `example.com` | `allowed:false`; matching forward-proxy deny recorded in the policy log |
| Docker socket | Visible at `/var/run/docker.sock` |
| Docker server reachable from probe | Yes; sandbox server reported `29.7.1` |
| Primary output write by sandbox identity | Allowed |

## Gate outcome

`FAIL` — this synthetic Docker Sandboxes configuration is ineligible for the P-3 ordinal 3 external OS-isolation proof.

The scoped network deny was enforced for both direct and proxy-routed `example.com` traffic. This is a narrow synthetic capability pass, not a launch authorization. The configuration remains ineligible because the implementation-visible private Docker Engine/socket is an engine-control surface prohibited by the ordinal-3 candidate. The tested configuration did not establish a per-sandbox exact model-only egress allowlist; the scoped `--deny-network "**"` rule takes precedence over allow rules in this configuration. Its primary RW mount is also host-backed rather than a proven guest-only ephemeral scratch volume. It must not receive P-3 inputs or launch a P-3 role.

This is a fail-closed capability finding, not a schema-complete machine-verifiable evidence bundle. It has no sealed nonce, raw-transcript hash, mount/ACL trace hash, or implementation-identity UID/ACL binding. P-11 remains `NOT_AUTHORIZED`.

Any successor external runtime configuration must prove all of the following before P-3 publication or delivery:

1. network deny is enforced through the configured proxy as well as direct egress;
2. the implementation identity has no Docker socket or equivalent engine-control access;
3. implementation input is read-only and persistent output is inaccessible to the implementation identity;
4. only a separately pinned exporter can atomically create `return.ustar.tar` in output.
5. only explicitly pinned model endpoints are allowed by a default-deny egress policy;
6. scratch is guest-only and disposable after export.
