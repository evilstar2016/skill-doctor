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
| `npm run test:coverage` | done | Coverage command restored, gate enforced, and report generated. |
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
| Executable core source modules | 95.17% | 87.60% | 95.83% | 95.17% |
| `src/conflicts/*` | 96.93% | 91.17% | 100% | 96.93% |
| `src/discovery/*` | 90.64% | 77.77% | 60% | 90.64% |
| `src/parsing/*` | 91.66% | 87.03% | 100% | 91.66% |
| `src/render/*` | 97.14% | 87.50% | 100% | 97.14% |

Interpretation:

- Coverage gate is now defined in `vitest.config.ts` against executable core source modules.
- Excluded from the gate: `src/cli/index.ts` (entrypoint orchestration measured by integration tests), `src/discovery/scanSkills.ts` (thin glue), and `src/types/**/*.ts` (type-only contracts).
- Core logic modules are now above the v0.1 target gate.

## Release Blockers

1. Decide whether v0.1 is only a GitHub release/private dogfood build, or also an npm release.

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