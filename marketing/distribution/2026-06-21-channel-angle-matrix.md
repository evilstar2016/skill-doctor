# Channel Angle Matrix - 2026-06-21

Goal: give the maintainer a small set of channel-specific angles for an authorized `skill-doctor` v0.3.4 post. Use one angle per channel, record the post URL, and wait for signal before reposting elsewhere.

Current baseline, checked 2026-06-30 07:33 Asia/Shanghai:

- GitHub stars: 0
- GitHub forks: 0
- GitHub watchers/subscribers: 0
- Open issues: 3
- GitHub Discussions: enabled
- Discussion #6 comments: 0
- npm latest: 0.3.4
- GitHub latest release: v0.3.4
- Local `main` package version: 0.3.4
- HN Show HN: blocked by `showlim`; do not bypass HN rules

Primary links:

- Repository: https://github.com/evilstar2016/skill-doctor
- npm: https://www.npmjs.com/package/@evilstar2025/skill-doctor
- Release: https://github.com/evilstar2016/skill-doctor/releases/tag/v0.3.4
- Demo output: https://github.com/evilstar2016/skill-doctor/blob/main/docs/demo-output.md
- Comparison: https://github.com/evilstar2016/skill-doctor/blob/main/docs/comparisons/manual-agent-config-audit.md
- Feedback issue: https://github.com/evilstar2016/skill-doctor/issues/4
- Discussion: https://github.com/evilstar2016/skill-doctor/discussions/6
- v0.3.3 release: https://github.com/evilstar2016/skill-doctor/releases/tag/v0.3.3
- v0.3.4 release: https://github.com/evilstar2016/skill-doctor/releases/tag/v0.3.4

## Angle 1: Local Security Audit

Use for: security-minded developers, platform engineering, private team chats, AI tooling groups that care about local-only checks.

Lead with:

```text
AI agent instructions are now part of the local supply chain: Claude Code skills, Cursor rules, Copilot instructions, Codex AGENTS.md, Gemini CLI paths, and more.
```

Post:

```text
I shipped skill-doctor v0.3.2, a local CLI for auditing AI agent skills/rules/instructions before they quietly become a messy config layer.

It scans local files for duplicates, overlapping triggers, risky wording such as credential exposure or upload instructions, and cross-agent drift.

Quick run:
npx @evilstar2025/skill-doctor scan

Safe demo output if you want to inspect before running it:
https://github.com/evilstar2016/skill-doctor/blob/main/docs/demo-output.md

It reads local files and does not upload skill files by default.

Repo: https://github.com/evilstar2016/skill-doctor
Feedback: https://github.com/evilstar2016/skill-doctor/issues/4
Discussion: https://github.com/evilstar2016/skill-doctor/discussions/6
```

Best CTA: ask for suspicious instruction patterns worth detecting.

## Angle 2: Multi-Agent Drift

Use for: developers who use more than one coding agent, Cursor/Claude/Codex/Copilot communities, personal account posts.

Lead with:

```text
If two coding agents behave differently in the same repo, the problem may be the instruction layer, not the model.
```

Post:

```text
I built skill-doctor for the part of AI coding workflows that is easy to forget: skills, rules, AGENTS.md files, Copilot instructions, and project/global agent config.

It runs locally and reports:
- duplicate skills
- overlapping triggers
- risky instructions
- drift across Claude Code, Cursor, Copilot, Codex, Gemini CLI, Windsurf, Kiro, Trae, OpenCode, OpenClaw, and Hermes paths

Try the safe demo:
git clone https://github.com/evilstar2016/skill-doctor.git
cd skill-doctor/examples/conflicted-agent-project
npx @evilstar2025/skill-doctor scan --scope project
npx @evilstar2025/skill-doctor conflicts --scope project
npx @evilstar2025/skill-doctor audit --scope project

Repo: https://github.com/evilstar2016/skill-doctor
Demo output: https://github.com/evilstar2016/skill-doctor/blob/main/docs/demo-output.md
```

Best CTA: ask for redacted real drift cases.

## Angle 3: Manual Audit Alternative

Use for: engineering leads, platform teams, developer tooling communities, posts where the audience already reviews prompts or rules manually.

Lead with:

```text
Manual review and grep help when you already know which AI agent instruction file matters. The hard part is finding the whole inventory first.
```

Post:

```text
I wrote up where skill-doctor fits compared with manual review, grep/shell scripts, and custom internal linting for AI agent config:

https://github.com/evilstar2016/skill-doctor/blob/main/docs/comparisons/manual-agent-config-audit.md

The short version: use skill-doctor as a local first-pass inventory and risk scan, then manually review the findings that are team-specific.

Run:
npx @evilstar2025/skill-doctor scan
npx @evilstar2025/skill-doctor conflicts
npx @evilstar2025/skill-doctor audit

Feedback I need most: false positives, missing platform paths, and real cases where overlapping agent rules caused confusion.
```

Best CTA: ask for one missing platform/path.

## Angle 4: Demo-First

Use for: short posts, chat groups, and channels where asking people to install a new CLI first is too much friction.

Lead with:

```text
No need to scan your real setup first; the repo includes a redacted demo project.
```

Post:

```text
skill-doctor v0.3.2 now has a safe demo project for AI agent skill/rule conflicts.

Expected output:
https://github.com/evilstar2016/skill-doctor/blob/main/docs/demo-output.md

Run it:
git clone https://github.com/evilstar2016/skill-doctor.git
cd skill-doctor/examples/conflicted-agent-project
npx @evilstar2025/skill-doctor scan --scope project
npx @evilstar2025/skill-doctor conflicts --scope project
npx @evilstar2025/skill-doctor audit --scope project

It shows discovered instruction files, a trigger conflict, and audit findings without touching your real agent setup.
```

Best CTA: ask whether the demo matches a real setup users have seen.

## Angle 5: Feedback Fixture Request

Use for: small trusted groups where the maintainer can ask for help directly without making a promotional post.

Lead with:

```text
I am looking for redacted examples, not stars.
```

Post:

```text
I am collecting real examples for skill-doctor, a local CLI that audits AI agent skills/rules/instructions.

Useful feedback:
- a false positive from conflict or audit detection
- a missing platform/path
- a suspicious instruction pattern worth flagging
- a redacted case where overlapping rules made an agent behave inconsistently

Discussion for lightweight examples:
https://github.com/evilstar2016/skill-doctor/discussions/6

Actionable reports:
https://github.com/evilstar2016/skill-doctor/issues/4

Repo:
https://github.com/evilstar2016/skill-doctor
```

Best CTA: ask for one redacted fixture or path.

## Selection Rules

- Use only one angle per channel.
- Do not cross-post identical copy to multiple communities.
- Do not ask for stars, upvotes, comments, or shares.
- Do not post where community rules disallow project announcements or AI tooling posts.
- Use `v0.3.4` in new public posts. Existing `v0.3.3` copy remains accurate for scan/conflict/audit messaging, but it omits the new context-cost CTA.
- Record the post URL, posted time, stars, open issues, issue #4 comments, and Discussion #6 comments in the campaign file.

## Tracking Fields

```text
Channel:
Angle used:
Post URL:
Posted at:
Baseline stars:
Baseline forks:
Baseline watchers:
Baseline open issues:
Baseline issue #4 comments:
Baseline Discussion #6 comments:
1h check:
6h check:
24h check:
Feedback converted to issues:
```
