# Roadmap

`skill-doctor` is a local diagnostics CLI for AI agent skills, rules, and instruction files. The current goal is to make it useful enough that developers can run it once, understand a real problem in their setup, and share it with teammates.

## Near-term priorities

1. **Release hygiene**
   - Publish a fresh npm version after the latest README, metadata, and AI audit updates.
   - Align GitHub releases, tags, npm metadata, and changelog entries.
   - Add a repeatable release checklist.

2. **Adoption path**
   - Keep the 30-second quickstart reliable on clean machines.
   - Add a short demo GIF or terminal recording for scan, conflicts, audit, and dashboard.
   - Publish example reports that do not expose private skill content.

3. **Detection quality**
   - Reduce false positives in token-based conflict detection.
   - Improve explanations for why two skills conflict.
   - Add more real-world fixtures for Claude Code, Cursor, Copilot, Codex, Gemini CLI, Windsurf, Kiro, Trae, OpenCode, OpenClaw, and Hermes.

4. **Security audit depth**
   - Expand built-in rules for prompt-injection-style skill instructions.
   - Make AI-assisted audit findings easier to verify and cache.
   - Document safe defaults for local-only analysis.

5. **Contributor experience**
   - Add issue templates for false positives, platform support, and rule requests.
   - Document how to add a new platform resolver.
   - Add small, well-scoped `good first issue` candidates.

6. **Installation architecture convergence** *(partially done)*
   - Status: the unified `center.json` store (`src/library/centerStore.ts`) is implemented and is the single source of truth for CLI and UI; legacy `catalog.json` / `deployments.json` / `registry.json` files are read only during migration.
   - Remaining: share install API request/response contracts between the server and web client instead of duplicating them, and split source selection, target inventory, and registered-install management out of `ManagePage`.

7. **Task-aware resource optimization** *(largely shipped in v0.7.0)*
   - Status: resource inventory, the Codex Optimization Suggestions UI flow, shared CLI/UI history-audit controls with preview, digest confirmation and undo, and fresh-session verification are implemented (see CHANGELOG 0.7.0).
   - Remaining: broaden recommendations beyond Codex-supported controls, and keep distinguishing estimated context savings from runtime effects as coverage grows.
   - Inventory project and user resources when opening Skill Doctor or invoking the optimizer Skill, using static local discovery by default.
   - Use the user's task intent to recommend keeping, enabling, or disabling skills, MCP resources, and plugins, with explicit reasons and uncertain items left unchanged.
   - Share recommendation, preview, approval, and execution logic between UI and Skill entry points; initially execute only confirmed project-local disables through supported Codex controls.
   - Show plugin and MCP dependency effects, reject stale approvals, preserve original configuration for undo, and verify each change without overwriting later user edits.
   - Keep enablement advisory initially, and distinguish estimated context savings from runtime effects that require a new session.

## Non-goals

- No fake stars, paid star campaigns, or spammy promotion.
- No uploading user skills by default.
- No destructive cleanup without explicit user confirmation.
- No broad dependency additions unless they materially improve local diagnostics.

## Current growth focus

- Make the GitHub landing page immediately understandable.
- Keep install commands correct for the scoped npm package.
- Prepare high-signal launch material for developer communities.
- Convert early feedback into issues and small fixes quickly.
