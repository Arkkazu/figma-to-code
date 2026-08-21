# R5 ordinal 3 Docker Sandboxes non-Docker capability probe — incomplete gate

Scope: synthetic probe only. No P-3 attachment, role home, coordinator record, worktree, or site was mounted or changed.

## Probe construction

- Docker Sandboxes CLI: `sbx` v0.38.0.
- Sandbox: `p3-isolation-capability-nondocker-v1` (stopped after measurement; retained only as synthetic probe configuration).
- Explicit template: `docker.io/docker/sandbox-templates:codex` (non-Docker variant).
- Primary RW mount: an initially empty synthetic scratch directory.
- Extra RO mount: four synthetic, non-P-3 regular files.
- Requested controls: `--no-share-skills` and scoped `--deny-network "**"`.

## Measurements

| Check | Result |
| --- | --- |
| Default UID | `1000` |
| Passwordless `sudo` | Available |
| `/var/run/docker.sock` | Absent |
| Host Vault path (`/c/AI/vault`) | Absent |
| Shared-skills mount entry | Absent from `/proc/self/mountinfo` |
| Synthetic attachment write | Denied with `Read-only file system` |
| Synthetic scratch write | Allowed; probe file was removed |
| Direct HTTPS egress to `example.com` | Denied |
| Proxy HTTPS egress to `example.com` | Denied with HTTP `403` and curl exit `22` |
| Daemon policy log | Forward-proxy deny for `example.com:443` recorded |

## Gate outcome

`FAIL / NOT AUTHORIZED` for the ordinal-3 external OS-isolation gate. The synthetic probe is incomplete: selecting the non-Docker template removed the previously observed `/var/run/docker.sock` exposure, but did not prove that every equivalent engine or control surface is absent. It therefore does not satisfy the ordinal-3 external OS-isolation proof.

The measured sandbox identity still has passwordless `sudo`. That alone does not prove a boundary bypass, but the required negative probes for mount, network, and service-boundary bypass are absent. The primary RW mount is host-backed rather than a proven guest-only disposable scratch volume, and the scoped deny-all rule also blocks model traffic, so this probe did not establish a default-deny, exact model-endpoint allowlist. The four synthetic attachments were read-only and no P-3 input was used, but this is not a launch authorization.

Before any P-3 publication, delivery, or role launch, a successor configuration must provide a schema-complete evidence bundle showing all of the following:

1. the implementation identity cannot access a Docker socket, equivalent engine control surface, or host control channel, demonstrated by pinned negative probes rather than one pathname check;
2. its permitted data is limited to the four read-only attachments and guest-only disposable scratch;
3. persistent output is not mounted or visible to that identity, and only the fixed exporter may atomically create `return.ustar.tar`;
4. egress is default-deny with only explicitly pinned model endpoints permitted; and
5. the identity's privilege model cannot bypass the stated mount, output, or network boundaries.

P-11 remains `NOT_AUTHORIZED`.
