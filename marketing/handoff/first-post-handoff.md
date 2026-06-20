# First External Post Handoff

Use this handoff when an authorized maintainer account is available. Do not post from an account unless the owner explicitly approves that channel.

Current baseline:

- Stars: 0
- Forks: 0
- Watchers: 0
- Open issues: 3
- Feedback issue #4 comments: 0
- npm latest: 0.3.2
- GitHub release: v0.3.2

Primary links:

- Repository: https://github.com/evilstar2016/skill-doctor
- Release: https://github.com/evilstar2016/skill-doctor/releases/tag/v0.3.2
- Feedback issue: https://github.com/evilstar2016/skill-doctor/issues/4
- v0.3.3 publish blocker: https://github.com/evilstar2016/skill-doctor/issues/5
- Full distribution queue: `marketing/distribution/2026-06-21-first-wave-queue.md`

Version note: public posts should currently refer to `v0.3.2`, because `0.3.3` is prepared on `main` but not published to npm yet.

## Option A: Hacker News Show HN

Use when: an HN account owner approves a Show HN submission.

Do not ask for upvotes, comments, or stars. Do not repost if it gets little attention.

1. Open https://news.ycombinator.com/submit
2. If not logged in, stop and ask the account owner to log in.
3. Submit this title:

```text
Show HN: skill-doctor, a local audit CLI for AI agent skills
```

4. Submit this URL:

```text
https://github.com/evilstar2016/skill-doctor
```

5. After the item is created, add this maintainer comment:

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

6. Copy the final HN item URL.
7. Update `marketing/campaigns/2026-06-20-v0.3.2-first-wave.md` with the HN item URL and posted time.
8. Schedule metric checks at 1h, 6h, and 24h after posting.

## Option B: Maintainer-Owned Short Post

Use when: the maintainer approves posting from a personal/professional account such as X/Twitter, LinkedIn, a personal blog, WeChat developer group, Discord, or Slack.

Do not cross-post identical text into multiple groups. Use one channel first and wait for a measurable result or 24h.

Post:

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

After posting:

1. Copy the post URL.
2. Update `marketing/campaigns/2026-06-20-v0.3.2-first-wave.md`.
3. Record the exact channel and posted time.
4. Check stars, forks, watchers, open issues, and issue #4 comments at 1h, 6h, and 24h.
5. Convert concrete reports into labeled GitHub issues.

## Metric Capture Template

Use this template immediately after posting:

```text
Channel:
Post URL:
Posted at:
Baseline stars:
Baseline forks:
Baseline watchers:
Baseline open issues:
Baseline issue #4 comments:
1h check due:
6h check due:
24h check due:
```

Use this template during each follow-up:

```text
Check time:
Post URL:
Stars:
Forks:
Watchers:
Open issues:
Issue #4 comments:
New feedback:
Issues created:
Next action:
```

## Stop Conditions

- Stop if the account owner has not authorized posting.
- Stop if the community rules disallow this kind of project post.
- Stop if the channel requires engagement manipulation, paid placement, or reciprocal starring.
- Stop if the post would expose private prompts, credentials, customer names, internal URLs, or proprietary code.
