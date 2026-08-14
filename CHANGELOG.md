# Changelog

All notable changes to `skill-doctor` are documented here.

## Unreleased

暂无未发布变更。

## 0.5.0 - 2026-08-15

### Features
- Add first-class Tencent WorkBuddy platform support with project, global, and connector Skill discovery.
- Parse WorkBuddy Skill frontmatter, enablement state, allowed tools, loading priority, and long-term context files.
- Discover static user/project WorkBuddy MCP configurations with disabled-state handling, malformed-config isolation, and secret redaction.
- Add WorkBuddy project/global Skill installation targets and `--platform workbuddy` filtering for scan and context-cost commands.
- Add WorkBuddy metadata and configuration-source provenance to CLI and Web UI results.
- Add the official WorkBuddy app mark as an inline SVG platform logo in the Web UI, avoiding a runtime remote-image dependency.

### Bug Fixes
- Preserve platform isolation when merging WorkBuddy resources, MCP servers, context-cost entries, and duplicate/conflict candidates.
- Keep disabled WorkBuddy Skills from incorrectly contributing effective context cost or falling back to lower-priority copies.
- Improve generic Skill parsing and rendering so missing frontmatter, allowed-tools metadata, and human-readable platform names remain compatible across agents.

### Documentation and Testing
- Add a six-part WorkBuddy implementation plan covering registration, discovery, context cost, MCP, installation, and release acceptance.
- Add WorkBuddy fixtures, adapter tests, installation tests, CLI integration coverage, UI regression coverage, and a multi-platform scenario regression.
- Update the bilingual README release links and platform-support documentation for `v0.5.0`.

## 0.4.2 - 2026-08-13

### Features
- Add opt-in debug logging for every LLM and embedding call site (explain, AI audit, conflict analysis, embedding provider), gated by `SKILL_DOCTOR_LLM_DEBUG` and streamed to stderr without exposing API keys. Load `.env` from the project root at CLI startup so the flag works from a `.env` entry instead of only a shell variable.
- Add brand-accurate agent platform logos, shown in the topbar agent tabs and on pending-agent group headings in the Skill Library.

### Bug Fixes
- Harden LLM JSON output and recover from malformed responses: enforce a JSON-only system prompt with few-shot examples and recover the first balanced JSON object from stray braces or markdown fences, instead of silently falling back to non-LLM output.
- Do not cache failed LLM calls so the deep health check retries the model instead of silently returning zero findings forever after one malformed response.
- Derive AI audit / embedding capabilities from live configuration in the UI.
- Filter pending skills by the selected agent, and scope pending imports and managed skills to the active library.

### Documentation
- Split `README` into English (`README.md`) and Chinese (`README.zh-CN.md`) with cross-links; publish a bilingual manual and UI gallery to the GitHub Pages source directory and link it prominently from each README.

## 0.4.1 - 2026-08-06

- Open-sourced the project: added `LICENSE` (MIT), `CODE_OF_CONDUCT.md`, and `SECURITY.md`.
- Cleaned up the repository: moved internal working docs (`doc/`, `docs/`, `feature-list/`, `UI_TECHNICAL_PLAN.zh-CN.md`) out of version control while keeping them locally; relocated public contributor docs to the repo root (`ADDING_PLATFORM.md`, `DEMO_OUTPUT.md`, `COMPARISON.md`).
- Fixed `README.md` / `README.zh-CN.md` version references and broken `docs/` links; added `"license": "MIT"` to `package.json`.

## 0.4.0 - 2026-08-06

- Added the complete `skill-doctor ui` local product interface with overview, issue triage, context cost, resource inventory, resource details, comparisons, install management, cleanup, and dashboard export.
- Added a shared application layer that composes the existing discovery, conflict, audit, cleanup, grouping, and context-cost engines into a stable UI snapshot.
- Added a loopback-only authenticated HTTP API with scan progress streaming, Codex resource controls, managed install/uninstall actions, and explicit destructive-action confirmation.
- Added responsive light/dark themes, local search and filtering, accessible status labels, and mobile navigation.
- Added local skill-directory preview and selective global/project installation in the management UI, with native directory selection, complete directory copy/link installation, and a reference list of skills already available to the target Agent.
- Added selective take-back of physical Agent skill directories into the central library, replacing approved originals with managed links while excluding existing links and blocking same-name content conflicts.
- Added `cost --platform codex --resource plugin --include-cache` to inventory cached plugin and Skill UI metadata without adding it to estimated context token tax.
- Added structured `catalog` JSON output with cache source, display metadata, icon paths, and implicit/explicit invocation policy.
- Added `config view/set/test` CLI commands for LLM and embedding configuration.
- Added side-by-side skill conflict diff view in the UI.
- Added full internationalization (i18n) with en-US and zh-CN coverage.
- Added managed skill deployment support across global and project scopes.
- Refactored platform adapters into modular components for maintainability.
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
