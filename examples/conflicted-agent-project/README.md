# Conflicted Agent Project

<p align="center">
  <img src="../../assets/brand/skill-doctor-logo.svg" alt="Skill Doctor" width="320">
</p>

This is a safe demo workspace for `skill-doctor`. It contains redacted GitHub Copilot instruction files that intentionally trigger duplicate-style overlap and audit findings.

Run from this directory:

```bash
npx @evilstar2025/skill-doctor scan --scope project
npx @evilstar2025/skill-doctor conflicts --scope project
npx @evilstar2025/skill-doctor audit --scope project
```

Expected findings:

- `git-workflow` and `github-automation` overlap on branch, commit, pull request, and release workflow language.
- `data-exporter` contains intentionally risky test-fixture language around `api_key` output and external upload.

These files are examples only. Do not copy their risky instructions into real agent configurations.
