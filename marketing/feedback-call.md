# Feedback wanted: real AI agent skill/rule drift cases

`skill-doctor` is looking for real examples of AI agent skill, rule, and instruction drift across tools like Claude Code, Cursor, GitHub Copilot, Codex, Gemini CLI, Windsurf, Kiro, Trae, OpenCode, OpenClaw, and Hermes.

Please use this issue to report one of these:

- a false positive from `skill-doctor conflicts` or `skill-doctor audit`
- a missing agent platform, directory, or file pattern
- an instruction pattern that looks risky but is not detected yet
- a real-world case where overlapping rules made an agent behave inconsistently

Safe ways to try it:

```bash
npx @evilstar2025/skill-doctor scan
npx @evilstar2025/skill-doctor conflicts
npx @evilstar2025/skill-doctor audit
```

Or use the redacted demo project first:

```bash
git clone https://github.com/evilstar2016/skill-doctor.git
cd skill-doctor/examples/conflicted-agent-project
npx @evilstar2025/skill-doctor scan --scope project
npx @evilstar2025/skill-doctor conflicts --scope project
npx @evilstar2025/skill-doctor audit --scope project
```

Safety boundary: `skill-doctor` reads local files and reports findings. It does not upload your skill files by default.

Helpful report format:

```text
Platform/tool:
Command run:
Expected result:
Actual result:
Relevant redacted path or file pattern:
Can this be turned into a redacted fixture? yes/no
```

Please redact private prompts, tokens, customer names, internal URLs, and proprietary code before posting.
