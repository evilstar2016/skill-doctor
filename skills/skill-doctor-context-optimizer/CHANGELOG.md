# Changelog

## 0.1.1 - 2026-09-01

- Added Chinese and English usage manuals covering installation, interactive
  review, CLI commands, safety boundaries, token estimates, and troubleshooting.
- Added documentation links to `SKILL.md`.

## 0.1.0 - 2026-08-21

- Added an interactive, conservative workflow for retaining task-relevant skills,
  MCP resources, and plugins while proposing project-local disables for the rest.
- Added deterministic snapshot, preview, confirmed apply, rollback, verified
  token-delta, and undo commands backed by the public skill-doctor CLI.
- Added Codex skill/plugin aggregate-cost handling, plugin and MCP hierarchy
  deduplication, unknown-cost exclusions, plan-integrity checks, and explicit MCP
  runtime consent.
- Added self-contained Node.js tests with a fake skill-doctor executable.
