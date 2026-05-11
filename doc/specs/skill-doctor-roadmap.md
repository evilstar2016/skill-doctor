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
| Suggested remediation text | next | Explain what to remove, merge, or inspect first. |

## F3. Release And Operability

Goal: make the CLI easy to validate, ship, and adopt.

| Small feature | Status | Notes |
| --- | --- | --- |
| Build and test scripts | done | `build`, `test`, `test:watch`, `test:coverage`. |
| Private remote repository | done | GitHub private repo is live. |
| Coverage reporting | in-progress | Script runs, but gate definition still unresolved. |
| Cold-start measurement | next | Needed for release checklist. |
| Public release flow | next | Decide npm release vs GitHub-only release. |
| CI automation | later | Add after coverage gate is stable. |

## F4. Skill Explanation Layer

Goal: tell users how a skill is meant to be used, not only that it exists.

| Small feature | Status | Notes |
| --- | --- | --- |
| Trigger extraction | done | Basic triggers already parsed. |
| Usage explanation generation | next | Convert parsed structure into human-friendly summaries. |
| Skill grouping by workflow | next | Cluster related skills by job-to-be-done. |
| Cross-skill overlap narratives | later | Explain why two skills compete and when each should win. |

## F5. Safety Audit

Goal: become the inspection layer that helps users trust or reject third-party skills.

| Small feature | Status | Notes |
| --- | --- | --- |
| Risk rulebook for local skills | next | Define risky patterns: shell execution, destructive commands, secret exposure, network use. |
| Static scan for dangerous instructions | next | Parse markdown/rule files and flag risk signatures. |
| Trust/provenance metadata | later | Show source repo, author, local origin, and confidence. |
| Security report output | later | Add `audit` command or `scan --security`. |

## F6. Asset Management

Goal: move from inspection to operational cleanup of the local skill set.

| Small feature | Status | Notes |
| --- | --- | --- |
| Duplicate cleanup suggestions | next | Point to which file is older or redundant. |
| Ignore list / allow list | next | Suppress known false positives. |
| Enable/disable workflow | later | Requires mutation policy and platform-specific write support. |
| Merge or consolidate suggestions | later | Needs stronger semantic understanding. |

## Current Recommendation

1. Finish F3 release hardening first.
2. Then build F5 safety audit as the next differentiating feature.
3. Keep F4 explanation layer as the supporting product layer after safety signals exist.