# IT Scenario: Semantic Cluster Detection

## Intent
Validate that embedding-based conflict detection catches semantically near-duplicate branch-readiness skills that token overlap misses.

## Setup
- Controlled temp workspace with 4 synthetic skills
- 3 skills describe PR / merge / ship readiness review
- 1 skill covers migration safety as the non-conflicting control
- Fake local embedding server returns one 3-skill cluster and one outlier

## Execute
- `skill-doctor conflicts --strategy token --json`
- `skill-doctor conflicts --strategy embedding --threshold 0.82 --json`

## Expect
- token strategy reports 0 conflicts
- embedding strategy reports the 3 pairwise conflicts inside the readiness cluster
- no conflict pair includes `migration-safety-guard`
