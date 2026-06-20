# Discussion #6: Share AI Agent Skill/Rule Drift Cases and Feedback

URL: https://github.com/evilstar2016/skill-doctor/discussions/6

Use this discussion for lightweight questions, examples, and early feedback about skill-doctor.

Good topics:

- false positives from `skill-doctor conflicts` or `skill-doctor audit`
- missing AI agent platform paths or instruction file patterns
- examples of overlapping rules that made an agent behave inconsistently
- questions before trying the safe demo or scanning your own setup

Safe demo:

```bash
git clone https://github.com/evilstar2016/skill-doctor.git
cd skill-doctor/examples/conflicted-agent-project
npx @evilstar2025/skill-doctor scan --scope project
npx @evilstar2025/skill-doctor conflicts --scope project
npx @evilstar2025/skill-doctor audit --scope project
```

Safety boundary: skill-doctor reads local files and reports findings. It does not upload your skill files by default.

For actionable bug reports, missing platform paths, or redacted fixtures, use issue #4 instead: https://github.com/evilstar2016/skill-doctor/issues/4

Please redact private prompts, tokens, customer names, internal URLs, and proprietary code before posting.
