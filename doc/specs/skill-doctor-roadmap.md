# Skill Doctor Roadmap

This file is the persistent tracking view for the project.

## Tracking Model

- Level 1: Big feature area
- Level 2: Small feature point
- Status: `done`, `in-progress`, `next`, `later`

## F1. Discovery And Visibility

Goal: answer what skills exist, where they come from, and where they take effect.

| Small feature | Status | Notes |
| --- | --- | --- |
| Multi-platform path discovery | done | Claude, Cursor, Copilot, Codex, Gemini, Windsurf, Trae, OpenCode, Kiro supported. |
| Project/global scope labeling | done | Supported in scan results and filters. |
| Single skill detail view | done | `show <name>` already available. |
| JSON inventory output | done | `scan --json` and `show --json` already available. |
| Per-scope and per-platform summary buckets | done | `summary.scopes` and `summary.platformsByScope` already available. |

## F2. Conflict Detection And Diagnosis

Goal: identify which rules overlap and explain why the agent may behave unstably.

| Small feature | Status | Notes |
| --- | --- | --- |
| Tokenization and stopwords | done | English and Chinese stopwords included. |
| Similarity-based conflict scoring | done | Fixed low/med/high thresholds. |
| Duplicate vs conflict split | done | Separate conflict kinds already shipped. |
| Conflict severity explanation | done | Shared tokens and similarity are exposed. |
| Conflict filtering and ranking | done | `--kind`, `--scope`, `--limit`, `--fail-on` already available. |
| Embedding-based semantic conflict scoring | done | Local embedding strategy, cache, scenario workflow, and recorded evidence are all in place on the F2 branch. |
| Optional AI conflict analysis | done | `--analyze` returns structured overlap / boundaries / strengths payloads for embedding candidates. |
| Suggested remediation text | done | Explain what to remove, merge, or inspect first. |

## F3. Release And Operability

Goal: make the CLI easy to validate, ship, and adopt.

| Small feature | Status | Notes |
| --- | --- | --- |
| Build and test scripts | done | `build`, `test`, `test:watch`, `test:coverage`. |
| Private remote repository | done | GitHub private repo is live. |
| Coverage reporting | done | Script runs and the gate is defined on executable core source modules. |
| Cold-start measurement | done | Measured at ~1.3s locally. |
| Public release flow | done | v0.1.0 GitHub release published (private dogfood, not npm). |
| CI automation | later | Add after coverage gate is stable. |

## F4. Skill Explanation Layer

Goal: tell users how a skill is meant to be used, not only that it exists.

| Small feature | Status | Notes |
| --- | --- | --- |
| Trigger extraction | done | Basic triggers already parsed. |
| Usage explanation generation | done | `show` now renders WHEN TO USE + RELATED SKILLS with persistent cache and non-LLM fallback. |
| Skill grouping by workflow | done | `scan --group` shipped with Union-Find clustering, persistent label cache, and batched LLM labeling for uncached groups. |
| Cross-skill overlap narratives | later | Explain why two skills compete and when each should win. |

## F5. Safety Audit

Goal: become the inspection layer that helps users trust or reject third-party skills.

| Small feature | Status | Notes |
| --- | --- | --- |
| Risk rulebook for local skills | done | 4 rules shipped: shell-exec / destructive / secret-leak / network-call. |
| Static scan for dangerous instructions | done | `audit` command live. HIGH=red / MED=yellow / LOW=gray in TTY; plain text in CI. 100% unit coverage. |
| Trust/provenance metadata | done | `scan` / `show` / `audit` now surface source repo, author, install source, local/global origin, and confidence. |
| Security report output | done | `audit --report [path]` writes an HTML report with summary cards, findings table, and provenance. Default filename: `skill-doctor-audit.html`. |

## F6. Asset Management

Goal: move from inspection to operational cleanup of the local skill set.

| Small feature | Status | Notes |
| --- | --- | --- |
| Duplicate cleanup suggestions | done | `conflicts` output now includes SUGGESTIONS section (plain text) and `suggestions` array (JSON) pointing to the older copy by mtime. |
| Ignore list / allow list | done | `~/.skill-doctor/config.json` `ignore.skillNames` and `ignore.conflictPairs` fields suppress pairs from `conflicts` and findings from `audit`. |
| Enable/disable workflow | later | Requires mutation policy and platform-specific write support. |
| Merge or consolidate suggestions | later | Needs stronger semantic understanding. |

## Current Recommendation

1. ~~Finish F3 release hardening first.~~ done — v0.1.0 shipped 2026-05-11.
2. ~~Land the scoped F2 branch (embedding conflict detection + feature scenario workflow).~~ done — 2026-05-13.
3. ~~Resume F5 safety audit.~~ done — `audit` command with 4 rules + TTY color output shipped 2026-05-13.
4. ~~F6 Asset Management — duplicate cleanup suggestions and ignore list.~~ done — 2026-05-13. All planned F6 `next` items complete; remaining items are `later`.
5. ~~F4 Skill Explanation Layer — explanation generation and workflow grouping.~~ done — 2026-05-13. Added persistent caches, structured JSON LLM calls, and batched group labeling.
