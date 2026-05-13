# Slice 3 Scenario: Optional Analysis

## Intent
Verify that AI analysis stays opt-in and only enriches already-detected embedding candidates.

## Execute
- `skill-doctor conflicts --strategy embedding --json`
- `skill-doctor conflicts --strategy embedding --analyze --json`

## Expect
- analysis fields are absent when `--analyze` is not provided
- analysis fields appear only for analyzed conflict pairs when `--analyze` is enabled
- base conflict detection remains usable without analysis config
