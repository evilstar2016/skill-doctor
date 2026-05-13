# Slice 5 Scenario: Semantic Calibration

## Intent
Validate that the threshold calibration reduces token-only blind spots while keeping obvious non-conflicting skills out of the cluster.

## Execute
- run the synthetic semantic-cluster scenario suite
- compare `conflicts --strategy token --json` with `conflicts --strategy embedding --json`
- smoke-run the current repo against a real local embedding service when available

## Expect
- token strategy misses the semantic cluster
- embedding strategy reports the readiness-review cluster
- the migration-control skill stays out of the conflict set
