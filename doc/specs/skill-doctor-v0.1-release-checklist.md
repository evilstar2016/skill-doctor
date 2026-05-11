# Skill Doctor v0.1 Release Checklist

Last updated: 2026-05-11

## Current Summary

- Status: release hardening
- Remote repo: `https://github.com/evilstar2016/skill-doctor`
- Package version: `0.1.0`
- Delivery form: local CLI

## Verified Now

| Item | Status | Evidence |
| --- | --- | --- |
| Private GitHub repository created | done | Remote `evilstar2016/skill-doctor` exists and is private. |
| `npm test` | done | 33 tests passing. |
| `npm run test:coverage` | done | Coverage command restored and report generated. |
| `npx tsc --noEmit` | done | Validated in the current release hardening cycle. |
| `npm run build` | done | Validated in the current release hardening cycle. |
| `scan` / `show` / `conflicts` main flows | done | Covered by integration tests and local manual validation. |
| JSON output | done | `scan/show/conflicts --json` covered by integration tests. |
| Scope, kind, and limit filters | done | Covered by integration tests. |
| `npx skill-doctor --version` cold start | done | Measured at about `1.3s` locally. |

## Coverage Snapshot

Command: `npm run test:coverage`

| Scope | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- |
| All files | 62.48% | 87.09% | 92.59% | 62.48% |
| `src/conflicts/*` | 96.93% | 91.17% | 100% | 96.93% |
| `src/discovery/*` | 90.64% | 77.77% | 60% | 90.64% |
| `src/parsing/*` | 91.66% | 87.03% | 100% | 91.66% |
| `src/render/*` | 97.14% | 87.50% | 100% | 97.14% |
| `src/cli/index.ts` | 0% | 100% | 100% | 0% |
| `src/types/skill.ts` | 0% | 0% | 0% | 0% |

Interpretation:

- Core logic modules are well covered.
- Overall coverage is pulled down by source-level instrumentation gaps in `src/cli/index.ts`, `src/discovery/scanSkills.ts`, and the pure-type file `src/types/skill.ts`.
- Before a public release, decide one of these two policies:
  - add source-level tests for CLI orchestration and scanner glue; or
  - exclude entrypoint/type-only files from the release coverage gate and measure the core logic modules separately.

## Release Blockers

1. Define the coverage gate for v0.1 and make it enforceable.
2. Decide whether v0.1 is only a GitHub release/private dogfood build, or also an npm release.

## Non-Blockers

1. Add color/table rendering.
2. Add machine-readable remediation hints to conflicts output.
3. Add publish automation or CI.

## Recommended Exit Criteria For v0.1

Ship v0.1 when all of the following are true:

1. `npm test`, `npm run test:coverage`, `npx tsc --noEmit`, `npm run build` all pass.
2. Coverage gate is explicitly defined and documented.
3. README, spec, tasks, and roadmap agree on the scope of v0.1.
4. The package is available either via npm or via a documented GitHub release workflow.