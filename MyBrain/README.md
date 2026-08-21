# MyBrain for figma-to-code

This directory is the public, repository-local memory layer for improving
`figma-to-code` in cloud agent sessions.

Cloud agents can read this repository clone, but they cannot read the local
upper layers such as `C:\AI\vault`, `C:\AI\web-development`, or project-side
`MyBrain/` directories. This directory exists to carry only the public context
that is needed to continue development of this repository itself.

## Read Order

1. `AGENTS.md` or `CLAUDE.md`
2. `WORKFLOW.md`
3. This file
4. `MyBrain/STATE.md`
5. `MyBrain/rules/`

## Scope

Allowed here:

- Repository-local development state for `figma-to-code`
- Publicly shareable decisions about this repository's tools, rules, and tests
- Cloud-agent constraints that affect future development
- Review notes and reports that contain no project-specific secrets

Not allowed here:

- Client or project secrets
- Figma file keys, node IDs, URLs, selectors, measured dimensions, or assets
- Credentials, cookies, tokens, SSH details, Basic auth, API keys, or private hostnames
- Copies of the full local upper-layer rulebooks

If a note needs private project facts, keep it in that project's local
`MyBrain/` instead of this directory. Before committing, run
`node tools/public-memory-scan.mjs`; it exits 2 when machine-detectable private
data is present in this directory.

## Name Collision With Project-Side `MyBrain/`

`MyBrain/` now means two different things, so read every reference by its
owner, not by its name.

- **This directory** (`<repo>/MyBrain/`) is public memory for developing
  `figma-to-code` itself. It holds no verification kit and no gate manifests.
- **Project-side `MyBrain/`** lives in a client repository and is private. Every
  `MyBrain/verify/...`, `MyBrain/rules/corrections.md`, `MyBrain/README.md`, and
  `MyBrain/WORKFLOW.md` path written in `rules/`, `templates/`, and
  `WORKFLOW.md` refers to that project-side directory, resolved against the
  project repository root - never against this one.

Do not create `verify/`, gate manifests, spec files, or node maps under this
directory, and do not resolve a project-side path against this repository.

The repository root `WORKFLOW.md` is the only execution rulebook.
`MyBrain/` stores public memory and its content policy only.
