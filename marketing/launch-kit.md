# skill-doctor Launch Kit

Use this when introducing `skill-doctor` to developer communities. Keep the tone practical: show the problem, the local command, and the safety boundary. Do not use fake engagement, automated spam, or misleading claims.

Repository: https://github.com/evilstar2016/skill-doctor

Feedback issue: https://github.com/evilstar2016/skill-doctor/issues/4
Discussion: https://github.com/evilstar2016/skill-doctor/discussions/6

npm:

```bash
npx @evilstar2025/skill-doctor scan
```

Release: https://github.com/evilstar2016/skill-doctor/releases/tag/v0.3.4

Safe demo:

```bash
git clone https://github.com/evilstar2016/skill-doctor.git
cd skill-doctor/examples/conflicted-agent-project
npx @evilstar2025/skill-doctor scan --scope project
npx @evilstar2025/skill-doctor conflicts --scope project
npx @evilstar2025/skill-doctor audit --scope project
npx @evilstar2025/skill-doctor cost --scope project
```

Expected demo output: https://github.com/evilstar2016/skill-doctor/blob/main/docs/demo-output.md

Comparison page: https://github.com/evilstar2016/skill-doctor/blob/main/docs/comparisons/manual-agent-config-audit.md

Channel angle matrix: https://github.com/evilstar2016/skill-doctor/blob/main/marketing/distribution/2026-06-21-channel-angle-matrix.md

Context-cost post draft: https://github.com/evilstar2016/skill-doctor/blob/main/marketing/distribution/2026-06-30-v0.3.4-context-cost-post.md

## v0.3.4 launch sequence

Use this sequence to get early signal without spamming identical posts.

1. **Maintainer-owned channels**
   - Pin or share the GitHub release link.
   - Use the short post below and include the safe demo commands.
   - Ask specifically for false positives, missing agent paths, and risky instruction examples.
   - Link the feedback issue so replies can become trackable reports.

2. **Developer communities**
   - Post once to a focused AI coding / developer tooling community.
   - Lead with the problem: skill/rule/instruction sprawl across agents.
   - Do not ask for stars directly; ask people to run the demo or scan their own setup.

3. **Feedback conversion**
   - Convert useful replies into GitHub issues.
   - Label false positives with `false-positive`.
   - Label missing platform/path requests with `platform`.
   - Reply with the release link and exact command so readers do not need to hunt.

4. **Second wave**
   - After at least 3 pieces of real feedback, post a follow-up with what changed or what was learned.
   - Use a different angle: local security audit, skill conflict debugging, or multi-agent drift.

## Launch metrics to record

Track these after each channel post:

- GitHub stars, forks, watchers
- npm version and weekly downloads
- GitHub issues opened
- false positives reported
- missing platform/path requests
- post URL and rough engagement

## One-line pitch

`skill-doctor` is a local CLI that finds duplicate, conflicting, risky, and drifting AI agent skills across Claude Code, Cursor, Copilot, Codex, Gemini CLI, Windsurf, Kiro, Trae, OpenCode, OpenClaw, and Hermes.

## Short post for v0.3.4

I shipped `skill-doctor` v0.3.4: a local `npm audit`-style CLI for AI agent skills and always-on instruction context cost.

If your Claude Code, Cursor, Copilot, Codex, or Gemini CLI setup has accumulated skills/rules/instructions from different sources, it can detect:

- duplicate skills in global and project paths
- overlapping triggers that make agents behave inconsistently
- suspicious instructions such as shell execution, destructive commands, credential exposure, or network uploads
- estimated per-turn context token tax from skills and always-on instruction files
- drift across multiple agent ecosystems

Try it:

```bash
npx @evilstar2025/skill-doctor scan
npx @evilstar2025/skill-doctor cost
```

Or run the safe demo first:

```bash
git clone https://github.com/evilstar2016/skill-doctor.git
cd skill-doctor/examples/conflicted-agent-project
npx @evilstar2025/skill-doctor scan --scope project
npx @evilstar2025/skill-doctor conflicts --scope project
npx @evilstar2025/skill-doctor audit --scope project
npx @evilstar2025/skill-doctor cost --scope project
```

It runs locally and does not upload your skill files.

GitHub: https://github.com/evilstar2016/skill-doctor
Feedback: https://github.com/evilstar2016/skill-doctor/issues/4
Discussion: https://github.com/evilstar2016/skill-doctor/discussions/6

## X / Twitter options

### Option A

AI agent setups are starting to look like dependency trees: Claude Code skills, Cursor rules, Copilot instructions, Codex AGENTS.md, and more.

I built `skill-doctor` to audit that mess locally:

```bash
npx @evilstar2025/skill-doctor scan
npx @evilstar2025/skill-doctor cost
```

v0.3.4 is live on npm and adds a context-cost estimate for always-on agent instructions.

https://github.com/evilstar2016/skill-doctor

Feedback thread: https://github.com/evilstar2016/skill-doctor/issues/4
Discussion: https://github.com/evilstar2016/skill-doctor/discussions/6

### Option B

If your coding agent behaves differently from one project to another, the problem may be your skill/rule/instruction layer.

`skill-doctor` scans local agent skills across Claude Code, Cursor, Copilot, Codex, Gemini CLI, Windsurf, Kiro, Trae, OpenCode, OpenClaw, and Hermes.

v0.3.4 includes a safe demo you can run before scanning your own setup.

https://github.com/evilstar2016/skill-doctor

Feedback thread: https://github.com/evilstar2016/skill-doctor/issues/4
Discussion: https://github.com/evilstar2016/skill-doctor/discussions/6

### Option C

I wanted `npm audit`, but for AI agent skills.

So I made `skill-doctor`: local CLI, no upload, detects duplicate skills, overlapping triggers, risky instructions, and cross-agent drift.

```bash
npx @evilstar2025/skill-doctor scan
```

https://github.com/evilstar2016/skill-doctor

Feedback thread: https://github.com/evilstar2016/skill-doctor/issues/4
Discussion: https://github.com/evilstar2016/skill-doctor/discussions/6

### Option D

In `skill-doctor` v0.3.4: a runnable demo project.

It shows:

- 3 discovered agent instruction files
- 1 trigger conflict
- 2 audit findings

No need to scan your real setup first.

https://github.com/evilstar2016/skill-doctor

Feedback thread: https://github.com/evilstar2016/skill-doctor/issues/4
Discussion: https://github.com/evilstar2016/skill-doctor/discussions/6

## Hacker News / Reddit title ideas

- Show HN: skill-doctor, a local audit CLI for AI agent skills
- I built a local CLI to find conflicts and risky instructions in AI agent skills
- AI agent skills are becoming dependency trees, so I made an audit tool for them
- A local audit CLI for Claude Code skills, Cursor rules, Copilot instructions, and Codex AGENTS.md

## Longer community post

AI coding agents now have a growing configuration layer: skills, rules, instructions, project memory, global memory, and tool-specific conventions. After enough installs and copied guides, the agent can start acting inconsistently because two skills trigger on the same task, or because a risky instruction is buried in a file nobody reviewed.

`skill-doctor` is a local CLI for diagnosing that layer. It scans common global and project paths for Claude Code, Cursor, GitHub Copilot, Codex, Gemini CLI, Windsurf, Kiro, Trae, OpenCode, OpenClaw, and Hermes.

It reports duplicate skills, token/semantic conflicts, suspicious instructions, cleanup candidates, and an optional HTML dashboard.

Install/run:

```bash
npx @evilstar2025/skill-doctor scan
npx @evilstar2025/skill-doctor conflicts
npx @evilstar2025/skill-doctor audit
npx @evilstar2025/skill-doctor dashboard
```

The safety boundary is simple: it reads local files and reports findings. It does not upload skills by default.

If you do not want to scan your own setup first, v0.3.4 includes a safe demo:

```bash
git clone https://github.com/evilstar2016/skill-doctor.git
cd skill-doctor/examples/conflicted-agent-project
npx @evilstar2025/skill-doctor scan --scope project
npx @evilstar2025/skill-doctor conflicts --scope project
npx @evilstar2025/skill-doctor audit --scope project
npx @evilstar2025/skill-doctor cost --scope project
```

Feedback I am looking for:

- false positives in conflict detection
- missing agent platforms or paths
- suspicious instruction patterns worth auditing
- examples of real-world skill drift

Repository: https://github.com/evilstar2016/skill-doctor

Feedback issue: https://github.com/evilstar2016/skill-doctor/issues/4
Discussion: https://github.com/evilstar2016/skill-doctor/discussions/6

## Comparison angle

Use this when the audience already audits prompts or agent rules manually.

```text
Manual review and grep still help when you know exactly which AI agent instruction file to inspect.

The hard part is the inventory: Claude Code skills, Cursor rules, Copilot instructions, Codex AGENTS.md, Gemini CLI paths, Windsurf rules, and project/global copies can overlap.

I wrote down where skill-doctor fits vs manual review, grep, and custom linting:

https://github.com/evilstar2016/skill-doctor/blob/main/docs/comparisons/manual-agent-config-audit.md

The short version: use skill-doctor for a local first-pass scan, then manually review anything risky or team-specific.
```

## Channel angle matrix

Use the channel angle matrix when choosing the first authorized post angle for a specific audience:

https://github.com/evilstar2016/skill-doctor/blob/main/marketing/distribution/2026-06-21-channel-angle-matrix.md

It includes ready-to-use variants for local security audit, multi-agent drift, manual audit alternative, demo-first, and feedback fixture requests.

Use the dedicated context-cost draft when the audience cares about prompt budgets or always-on instruction overhead:

https://github.com/evilstar2016/skill-doctor/blob/main/marketing/distribution/2026-06-30-v0.3.4-context-cost-post.md

## Product Hunt / directory copy

Name: skill-doctor

Tagline: Local audit CLI for AI agent skills

Description:

`skill-doctor` scans local AI agent skills, rules, and instruction files to find duplicate skills, overlapping triggers, suspicious instructions, context token cost, and cross-platform drift. It supports Claude Code, Cursor, GitHub Copilot, Codex, Gemini CLI, Windsurf, Kiro, Trae, OpenCode, OpenClaw, and Hermes. It is designed for developers who have accumulated multiple agent configurations and want a quick local health check without uploading private skill files.

## Outreach checklist

- Confirm README quickstart works on a clean machine.
- Confirm npm latest version matches the release notes.
- Include the repository link and exact `npx` command.
- Mention local-only behavior clearly.
- Ask for concrete feedback, especially false positives and missing platforms.
- Avoid cross-posting identical text everywhere at once.
- Record the post URL and metrics after each channel.
