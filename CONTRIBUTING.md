# Contributing

Thanks for helping improve `skill-doctor`. The most useful contributions right now are small, reproducible reports from real agent setups.

## Contribute in one paste

New here? Copy the prompt in [docs/contribute-prompt.md](docs/contribute-prompt.md) ([中文](docs/contribute-prompt.zh-CN.md)) into your agent. It inspects your local setup, picks one of the three tracks below, verifies the change with the repository gates, and opens the pull request for you.

## Good first contributions

- Report a false positive from `skill-doctor conflicts`.
- Request a missing platform path for an agent or editor.
- Add a safe fixture that represents a real skill/rule/instruction format.
- Add or update a platform adapter using [ADDING_PLATFORM.md](ADDING_PLATFORM.md).
- Improve wording for audit findings so users can act on them faster.
- Add tests for a platform resolver or audit rule.

## Local setup

```bash
npm install
npm test
npm run build
```

Run the CLI from source:

```bash
npm run build
node dist/index.cjs scan --scope project
```

## Safety rules

- Do not include private skill files, API keys, tokens, customer data, or internal paths in issues.
- Redact sensitive content before sharing command output.
- Do not add behavior that uploads local skills by default.
- Destructive cleanup must stay opt-in and require explicit confirmation.

## Pull request checklist

- Keep changes focused.
- Add or update tests when detection behavior changes.
- For platform support changes, update `src/platforms/registry.ts` and [ADDING_PLATFORM.md](ADDING_PLATFORM.md) if the extension path changes.
- Update README, CHANGELOG, or ROADMAP when user-facing behavior changes.
- Run `npm test` before opening the PR.
