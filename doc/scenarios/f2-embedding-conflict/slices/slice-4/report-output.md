# Slice 4 Scenario: Report Output

## Intent
Verify that terminal, JSON, and HTML outputs all reflect the chosen detection strategy and optional analysis summary.

## Execute
- `skill-doctor conflicts --strategy embedding --json`
- `skill-doctor scan --strategy embedding --report`

## Expect
- JSON output includes `detectionMethod`
- terminal output shows the strategy-specific conflict details
- generated report surfaces embedding-based conflicts without breaking prior report flow
