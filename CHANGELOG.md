# Changelog

All notable changes to `skill-doctor` are documented here.

## Unreleased

- Added the complete `skill-doctor ui` local product interface with overview, issue triage, context cost, resource inventory, resource details, comparisons, install management, cleanup, and dashboard export.
- Added a shared application layer that composes the existing discovery, conflict, audit, cleanup, grouping, and context-cost engines into a stable UI snapshot.
- Added a loopback-only authenticated HTTP API with scan progress streaming, Codex resource controls, managed install/uninstall actions, and explicit destructive-action confirmation.
- Added responsive light/dark themes, local search and filtering, accessible status labels, and mobile navigation.
- Added local skill-directory preview and selective global/project installation in the management UI, with native directory selection, complete directory copy/link installation, and a reference list of skills already available to the target Agent.
- Added `cost --platform codex --resource plugin --include-cache` to inventory cached plugin and Skill UI metadata without adding it to estimated context token tax.
- Added structured `catalog` JSON output with cache source, display metadata, icon paths, and implicit/explicit invocation policy.
- Fixed MCP context-cost discovery for VS Code JSONC configs, project-relative stdio servers, and legacy SSE transports; UI scans now inspect live tool lists by default for Copilot and Codex.

## 0.3.5 - 2026-07-08

- Fixed GitHub Copilot context cost accounting to include prompt files, nested `AGENTS.md` agent instructions, and multiple nested `.github/instructions/**/*.instructions.md` files.
- Added Copilot MCP config discovery for `.vscode/mcp.json` and `.github/mcp.json`, including `tools` allowlists.
- Documented Copilot instructions, prompts, skills, and MCP coverage in the cost report docs.

## 0.3.4 - 2026-06-30

- Added `cost` / `context` commands to estimate per-turn context token tax, grade it against a token budget, and fail CI with `--fail-on-budget`.
- Added platform-aware cost modes for Cursor rules, GitHub Copilot instruction files, and non-Claude skill-dir agents.
- Added per-coding-agent cost summaries, explicit `cost [project-dir]` support, default project+global cost accounting, and project/global `.codex` plus `.agent` skill discovery.
- Added `cost --platform <agent>` filtering for target-agent cost reports.
- Added JSON output and tests for context cost summaries, item-level estimates, and budget validation.

## 0.3.3 - 2026-06-21

- Added npm package keywords for AI agent, CLI, developer tooling, and security audit discovery.
- Kept this patch release focused on package metadata; no runtime behavior changed.

## 0.3.2 - 2026-06-20

- Added README quickstart demo artwork and clearer 30-second trial path.
- Updated GitHub repository metadata, topics, and project positioning.
- Added launch and roadmap materials for contributors and early adopters.
- Added contribution guide, issue templates, pull request template, release checklist, and starter issues.
- Added a runnable safe demo project that shows scan, conflict, and audit findings without scanning a user's real setup.

## 0.3.1

- Linked the npm package metadata back to the GitHub repository.
- Published the scoped package as `@evilstar2025/skill-doctor`.

## 0.3.0

- Added the `dashboard` command for a unified HTML report.
- Improved scan, audit, conflict, and cleanup rendering for local skill inventories.
- Expanded multi-platform skill discovery coverage.

## 0.2.0

- Added conflict detection for overlapping skill descriptions and trigger keywords.
- Added duplicate detection across global and project skill paths.
- Added JSON output support for automation and CI usage.

## 0.1.0

- Initial public release.
- Added local skill scanning and terminal reporting.
