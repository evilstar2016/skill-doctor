# Changelog

All notable changes to `skill-doctor` are documented here.

## 0.3.4 - 2026-06-29

- Added `cost` / `context` commands to estimate per-turn context token tax, grade it against a token budget, and fail CI with `--fail-on-budget`.
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
