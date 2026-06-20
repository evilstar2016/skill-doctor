# First-Wave Distribution Queue - 2026-06-21

Goal: create the first legitimate external exposure loop for `skill-doctor` v0.3.2 without asking for stars, buying attention, or cross-posting identical spam. Each post should ask for one concrete action: run the safe demo or report a redacted false positive / missing path in issue #4.

Current public assets:

- Repository: https://github.com/evilstar2016/skill-doctor
- npm: https://www.npmjs.com/package/@evilstar2025/skill-doctor
- Release: https://github.com/evilstar2016/skill-doctor/releases/tag/v0.3.2
- Feedback issue: https://github.com/evilstar2016/skill-doctor/issues/4
- Safe demo path: `examples/conflicted-agent-project`

Current baseline before external posting:

- Stars: 0
- Forks: 0
- Watchers: 0
- Open issues: 3
- npm latest: 0.3.2
- npm keywords: not returned yet; `0.3.3` metadata patch is prepared but unpublished.

## Channel 1: Hacker News Show HN

Status: ready, requires a logged-in HN account.

Submission URL: https://news.ycombinator.com/submit

Rules checked:

- HN guidelines say submissions should be interesting to hackers and should not use promotional tricks, upvote requests, or comment solicitation: https://news.ycombinator.com/newsguidelines.html
- HN FAQ says Show HN is for sharing personal work and appears on `newest` and `shownew`: https://news.ycombinator.com/newsfaq.html

Risk notes:

- Do not ask for stars, upvotes, comments, or shares.
- Do not submit generated-looking marketing copy. Keep the body factual and written as a maintainer note.
- Do not delete and repost if it gets little attention.

Title:

```text
Show HN: skill-doctor, a local audit CLI for AI agent skills
```

URL:

```text
https://github.com/evilstar2016/skill-doctor
```

First maintainer comment to add after submission:

```text
I built this after seeing Claude Code skills, Cursor rules, Copilot instructions, Codex AGENTS.md files, and similar agent config accumulate across projects.

The tool scans local skill/rule/instruction files and reports duplicates, overlapping triggers, risky wording, and cross-agent drift. It runs locally and does not upload skill files by default.

Quick run:

npx @evilstar2025/skill-doctor scan

If you do not want to scan your own setup first, the repo includes a redacted demo:

git clone https://github.com/evilstar2016/skill-doctor.git
cd skill-doctor/examples/conflicted-agent-project
npx @evilstar2025/skill-doctor scan --scope project
npx @evilstar2025/skill-doctor conflicts --scope project
npx @evilstar2025/skill-doctor audit --scope project

The feedback I am trying to collect is narrow: false positives, missing agent paths, risky instruction patterns, and real cases where overlapping rules made an agent behave inconsistently.

Feedback issue: https://github.com/evilstar2016/skill-doctor/issues/4
```

Post-log fields to fill:

- HN item URL:
- Posted at:
- Stars after 1h:
- Stars after 6h:
- Stars after 24h:
- Issue #4 comments after 24h:
- Useful feedback converted to issues:

## Channel 2: Maintainer-Owned Short Post

Status: ready, requires user-owned account authorization.

Good targets: X/Twitter, LinkedIn, personal blog, WeChat developer group, Discord/Slack community where the maintainer is already active.

Risk notes:

- Use only channels where the maintainer has standing context or permission.
- Do not post identical text to many groups.
- Do not ask for stars. Ask for a demo run or a redacted report.

Short post:

```text
I shipped skill-doctor v0.3.2: a local CLI for auditing AI agent skills, rules, and instruction files.

It scans Claude Code skills, Cursor rules, Copilot instructions, Codex AGENTS.md, Gemini CLI, Windsurf, Kiro, Trae, OpenCode, OpenClaw, and Hermes paths for:

- duplicate skills
- overlapping triggers
- risky wording like credential exposure or network upload instructions
- cross-agent config drift

Try the safe demo first:

git clone https://github.com/evilstar2016/skill-doctor.git
cd skill-doctor/examples/conflicted-agent-project
npx @evilstar2025/skill-doctor scan --scope project
npx @evilstar2025/skill-doctor conflicts --scope project
npx @evilstar2025/skill-doctor audit --scope project

It reads local files and does not upload your skill files by default.

GitHub: https://github.com/evilstar2016/skill-doctor
Feedback: https://github.com/evilstar2016/skill-doctor/issues/4
```

Post-log fields to fill:

- Channel:
- Post URL:
- Posted at:
- Stars after 24h:
- Feedback received:
- Follow-up needed:

## Channel 3: Focused Community Post

Status: hold until community rules are checked immediately before posting.

Candidate angles:

- Local security audit for AI agent instruction files.
- Debugging overlapping agent rules across Claude Code / Cursor / Copilot / Codex.
- How agent configuration is becoming a dependency layer.

Risk notes:

- Avoid general-purpose programming communities if they restrict AI/LLM tool posts.
- Read the current community rules immediately before posting.
- Prefer one focused post with a real maintainer context over broad cross-posting.

Community post skeleton:

```text
I am looking for real-world fixtures for a local CLI that audits AI agent skill/rule/instruction files.

The problem: after a few months of using multiple coding agents, a project can accumulate Claude Code skills, Cursor rules, Copilot instructions, Codex AGENTS.md files, Gemini CLI paths, and similar config. Two files can trigger on the same task, or one can include risky wording nobody remembers adding.

The tool is skill-doctor. It runs locally and reports duplicates, overlapping triggers, suspicious instructions, and cross-agent drift.

Repo: https://github.com/evilstar2016/skill-doctor
Feedback issue: https://github.com/evilstar2016/skill-doctor/issues/4

I am especially looking for redacted examples of false positives, missing platform paths, or real drift cases.
```

Post-log fields to fill:

- Community:
- Rule page checked:
- Post URL:
- Posted at:
- Moderator/user feedback:
- Stars/issues after 24h:

## Execution Order

1. Post one account-authorized channel first, preferably HN Show HN or a maintainer-owned short post.
2. Record the post URL in `marketing/campaigns/2026-06-20-v0.3.2-first-wave.md`.
3. Check stars, forks, watchers, open issues, and issue #4 comments at 1h, 6h, and 24h.
4. Convert concrete feedback into labeled GitHub issues.
5. Do not post the same wording to another public community until the first post has at least one measurable result or 24h has passed.
