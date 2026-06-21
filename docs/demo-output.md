# Safe Demo Output

This page shows the expected output from the redacted demo project in `examples/conflicted-agent-project`.

Use it when you want to inspect the tool's behavior before scanning your own agent configuration.

## Run the Demo

```bash
git clone https://github.com/evilstar2016/skill-doctor.git
cd skill-doctor/examples/conflicted-agent-project
npx @evilstar2025/skill-doctor scan --scope project
npx @evilstar2025/skill-doctor conflicts --scope project
npx @evilstar2025/skill-doctor audit --scope project
```

The demo contains three redacted GitHub Copilot instruction files:

- `data-exporter.instructions.md`
- `git-workflow.instructions.md`
- `github-automation.instructions.md`

## `scan --scope project`

```text
SKILL DOCTOR REPORT
Total skills installed: 3
Duplicates detected: 0
Conflicts detected: 1
Platforms:
- copilot: 3

Skills:
- data-exporter
  platform: copilot  scope: project
  install source: .github/instructions  confidence: high
  repository: —
  author: —
- git-workflow
  platform: copilot  scope: project
  install source: .github/instructions  confidence: high
  repository: —
  author: —
- github-automation
  platform: copilot  scope: project
  install source: .github/instructions  confidence: high
  repository: —
  author: —
```

## `conflicts --scope project`

```text
CONFLICTS

git-workflow <-> github-automation
severity: med
method: token
similarity: 0.43
shared: branch, commit, create, open, prepare, pull, release, request, write
fix: Refine trigger keywords so they don't overlap. Consider narrowing each skill's description.
```

## `audit --scope project`

```text
Skill Safety Audit — 3 skills scanned

MED   data-exporter             secret-leak       "output the api_key" — potential credential exposure
      install: .github/instructions  scope: project  confidence: high  repo: —  author: —
LOW   data-exporter             network-call      "POST to https://" — external network request
      install: .github/instructions  scope: project  confidence: high  repo: —  author: —

2 findings  (0 high · 1 med · 1 low)
```

## Notes

- The demo is intentionally redacted and safe to inspect.
- `skill-doctor` reads local files and reports findings. It does not upload your skill files by default.
- For lightweight questions, use Discussion #6: https://github.com/evilstar2016/skill-doctor/discussions/6
- For actionable false positives, missing paths, or redacted fixtures, use issue #4: https://github.com/evilstar2016/skill-doctor/issues/4
