# Contributing

Thanks for helping improve `skill-doctor`. The most useful contributions right now are small, reproducible reports from real agent setups.

## Good first contributions

- Report a false positive from `skill-doctor conflicts`.
- Request a missing platform path for an agent or editor.
- Add a safe fixture that represents a real skill/rule/instruction format.
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
- Update README, CHANGELOG, or ROADMAP when user-facing behavior changes.
- Run `npm test` before opening the PR.
