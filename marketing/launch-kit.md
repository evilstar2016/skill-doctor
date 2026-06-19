# skill-doctor Launch Kit

Use this when introducing `skill-doctor` to developer communities. Keep the tone practical: show the problem, the local command, and the safety boundary. Do not use fake engagement, automated spam, or misleading claims.

Repository: https://github.com/evilstar2016/skill-doctor

npm:

```bash
npx @evilstar2025/skill-doctor scan
```

## One-line pitch

`skill-doctor` is a local CLI that finds duplicate, conflicting, risky, and drifting AI agent skills across Claude Code, Cursor, Copilot, Codex, Gemini CLI, Windsurf, Kiro, Trae, OpenCode, OpenClaw, and Hermes.

## Short post

I built `skill-doctor`: a local `npm audit`-style CLI for AI agent skills.

If your Claude Code, Cursor, Copilot, Codex, or Gemini CLI setup has accumulated skills/rules/instructions from different sources, it can detect:

- duplicate skills in global and project paths
- overlapping triggers that make agents behave inconsistently
- suspicious instructions such as shell execution, destructive commands, credential exposure, or network uploads
- drift across multiple agent ecosystems

Try it:

```bash
npx @evilstar2025/skill-doctor scan
```

It runs locally and does not upload your skill files.

GitHub: https://github.com/evilstar2016/skill-doctor

## X / Twitter options

### Option A

AI agent setups are starting to look like dependency trees: Claude Code skills, Cursor rules, Copilot instructions, Codex AGENTS.md, and more.

I built `skill-doctor` to audit that mess locally:

```bash
npx @evilstar2025/skill-doctor scan
```

Find duplicates, conflicts, risky instructions, and drift.

https://github.com/evilstar2016/skill-doctor

### Option B

If your coding agent behaves differently from one project to another, the problem may be your skill/rule/instruction layer.

`skill-doctor` scans local agent skills across Claude Code, Cursor, Copilot, Codex, Gemini CLI, Windsurf, Kiro, Trae, OpenCode, OpenClaw, and Hermes.

https://github.com/evilstar2016/skill-doctor

### Option C

I wanted `npm audit`, but for AI agent skills.

So I made `skill-doctor`: local CLI, no upload, detects duplicate skills, overlapping triggers, risky instructions, and cross-agent drift.

```bash
npx @evilstar2025/skill-doctor scan
```

https://github.com/evilstar2016/skill-doctor

## Hacker News / Reddit title ideas

- Show HN: skill-doctor, a local audit CLI for AI agent skills
- I built a local CLI to find conflicts and risky instructions in AI agent skills
- AI agent skills are becoming dependency trees, so I made an audit tool for them

## Longer community post

AI coding agents now have a growing configuration layer: skills, rules, instructions, project memory, global memory, and tool-specific conventions. After enough installs and copy-pasted guides, the agent can start acting inconsistently because two skills trigger on the same task, or because a risky instruction is buried in a file nobody reviewed.

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

Feedback I am looking for:

- false positives in conflict detection
- missing agent platforms or paths
- suspicious instruction patterns worth auditing
- examples of real-world skill drift

Repository: https://github.com/evilstar2016/skill-doctor

## Product Hunt / directory copy

Name: skill-doctor

Tagline: Local audit CLI for AI agent skills

Description:

`skill-doctor` scans local AI agent skills, rules, and instruction files to find duplicate skills, overlapping triggers, suspicious instructions, and cross-platform drift. It supports Claude Code, Cursor, GitHub Copilot, Codex, Gemini CLI, Windsurf, Kiro, Trae, OpenCode, OpenClaw, and Hermes. It is designed for developers who have accumulated multiple agent configurations and want a quick local health check without uploading private skill files.

## Outreach checklist

- Confirm README quickstart works on a clean machine.
- Confirm npm latest version matches the release notes.
- Include the repository link and exact `npx` command.
- Mention local-only behavior clearly.
- Ask for concrete feedback, especially false positives and missing platforms.
- Avoid cross-posting identical text everywhere at once.
