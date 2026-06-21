# skill-doctor vs manual AI agent config audits

AI agent configuration now lives in many places: Claude Code skills, Cursor rules, GitHub Copilot instructions, Codex `AGENTS.md`, Gemini CLI files, Windsurf rules, and similar project or global paths.

You can audit that layer by hand, with `grep`, with a custom script, or with `skill-doctor`. The right choice depends on what you need to learn.

## Quick comparison

| Approach | Best for | Where it breaks down |
|----------|----------|----------------------|
| Manual review | A small repo with one or two instruction files | Easy to miss global files, duplicate installs, and repeated trigger wording across tools |
| `grep` / shell scripts | Finding a known string such as `api_key`, `curl`, or `rm -rf` | Hard to explain overlapping intent, duplicates, provenance, or cross-agent drift |
| Custom internal lint | Enforcing one team's exact policy | Usually needs maintenance for every new agent path and output format |
| `skill-doctor` | Fast local inventory, duplicate checks, trigger conflicts, safety audit findings, and shareable reports | Not a replacement for human review of private, team-specific policy |

## When manual review is enough

Manual review is fine when the setup is small and you already know where every instruction file lives.

Use it for:

- reviewing one new skill before installing it
- checking a single project-level rules file
- making a judgment call on a risky but intentional internal workflow

Manual review becomes weaker when a developer has accumulated rules across global and project folders, or when multiple agent tools are active in the same repo.

## When `grep` is enough

`grep` is still useful for exact patterns:

```bash
rg "api_key|curl|rm -rf|eval" ~/.claude .cursor .github AGENTS.md
```

That catches known strings quickly. It does not tell you whether two skills compete for the same task, whether a duplicate skill exists in both global and project scope, or whether a finding came from Claude Code, Cursor, Copilot, Codex, or another platform path.

## Where skill-doctor fits

`skill-doctor` is designed for the first 30 seconds of an agent-config health check:

```bash
npx @evilstar2025/skill-doctor scan
npx @evilstar2025/skill-doctor conflicts
npx @evilstar2025/skill-doctor audit
```

It reports:

- discovered skill/rule/instruction files across supported agent paths
- duplicate skills across global and project scopes
- overlapping trigger language that may cause inconsistent agent behavior
- suspicious instructions such as shell execution, destructive operations, credential exposure, and network upload wording
- local provenance so a developer knows where each finding came from

The tool reads local files and reports findings on your machine. It does not upload skill files by default.

## Safe demo before scanning your setup

If you want to inspect the output before scanning your own files:

```bash
git clone https://github.com/evilstar2016/skill-doctor.git
cd skill-doctor/examples/conflicted-agent-project
npx @evilstar2025/skill-doctor scan --scope project
npx @evilstar2025/skill-doctor conflicts --scope project
npx @evilstar2025/skill-doctor audit --scope project
```

Expected output: [Safe demo output](../demo-output.md)

## Practical recommendation

Use `skill-doctor` as the inventory and first-pass audit. Then use manual review for anything it flags as risky, ambiguous, or team-specific.

For early feedback, the most useful reports are false positives, missing platform paths, and redacted examples of real agent-rule drift:

- Feedback issue: https://github.com/evilstar2016/skill-doctor/issues/4
- Lightweight discussion: https://github.com/evilstar2016/skill-doctor/discussions/6
