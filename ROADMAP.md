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

6. **Installation architecture convergence**
   - Replace the separate simple-install and managed-deployment paths with one shared `InstallTarget` model containing `targetId`, platform, scope, directory, and layout.
   - Route UI and CLI installs through the same preview/commit service, with one scope-aware registry and migration support for existing records.
   - Share install API request/response contracts between the server and web client instead of duplicating them.
   - Split source selection, target inventory, and registered-install management out of `ManagePage` when the unified service is adopted.

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
