# Public Memory Policy

This repository-local `MyBrain/` is intended to be committed to GitHub. It is
public memory, not a second execution rulebook.

## Allowed Content

- Public development notes for this repository
- Tooling and workflow decisions that contain no private project facts
- Review summaries with generic paths inside this repository
- Test plans and reports for repository-local scripts
- A concise statement that local-only context is unavailable to cloud agents

## Prohibited Content

- Figma file keys, node IDs, image URLs, exported assets, or design measurements
- Client names or project URLs unless already intentionally public in this
  repository's normal documentation
- CSS selectors, DOM mappings, or screenshots from client projects
- Credentials, tokens, cookies, SSH hosts, keys, Basic auth, API keys, or private
  infrastructure names
- Full copies of local upper-layer rulebooks

## Operating Limits

- Do not copy the full contents of `C:\AI\vault`, `C:\AI\web-development`, or a
  project-side `MyBrain/`.
- When a task requires local-only context, record the limitation and leave a
  bounded handoff for a local session; do not infer missing details.
- Keep state history append-only, concise, and evidence-based.
- A report under `reports/` must state its scope and whether it was produced in
  a local or cloud-restricted environment.

## Before Commit Or Push

Run a focused scan of changed files and inspect the diff. If uncertain, keep the
note out of Git and place it in the relevant local project-side `MyBrain/`.
