# Slice 1 Scenario: Strategy Parity

## Intent
Confirm that extracting strategy selection does not change the existing token-default CLI behavior.

## Execute
- `npm test`
- `npm run build`
- `skill-doctor conflicts --strategy token --json`

## Expect
- explicit `token` behaves the same as the default path
- duplicate detection still stays independent from semantic conflict detection
