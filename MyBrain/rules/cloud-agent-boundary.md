# Cloud Agent Boundary

Cloud agents normally receive only this repository clone. They may not have:

- `C:\AI\vault`
- `C:\AI\web-development`
- project-side `MyBrain/`
- user-level MCP, connector, or browser sessions
- local fonts and browser environments used for final Figma visual verification

Therefore, cloud agents may work on repository-local rules, tests, templates,
and static analysis, but must not claim completion for work that requires local
upper-layer context, project-side memory, Figma source access, or matching
browser/Figma measurement conditions.

When cloud-only evidence is insufficient, the correct output is a bounded
handoff note that lists the missing local checks.
