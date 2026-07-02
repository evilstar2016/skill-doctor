---
name: skill-doctor
description: Diagnose local AI agent skills, rules, instructions, MCP tool-list cost, conflicts, duplicates, safety risks, context token tax, and HTML health reports. Use when asked to scan/list skills, check conflicts, audit safety, estimate context cost, compare skills, group skills, inspect one skill, clean duplicates, or manage skill installs.
---

# Skill Doctor

Use the local CLI. Prefer concise terminal output; use `--json` only when automation or exact fields are needed.

```bash
node /Users/evilstar/GitHub/skill-doctor/dist/index.cjs <command>
```

## Token-saving defaults

- Run the narrowest command that answers the user.
- Do not paste full JSON; summarize counts, top risks, and paths.
- For broad health checks, prefer `dashboard` over running every command and narrating all output.
- For conflicts, use `--limit N` when the user asks for a quick check.
- For audit, use `--severity high` first when the user asks "is it safe?"
- For context bloat, use `cost` / `context` instead of manually reading instruction files.

## Commands

| Need | Command |
| --- | --- |
| Inventory | `scan` |
| Inventory grouped by purpose | `scan --group` |
| One skill details | `show <name>` |
| Conflicts/duplicates | `conflicts [--kind duplicate|conflict] [--limit N]` |
| Safety audit | `audit [--severity high|med|low]` |
| Context token tax | `cost [project-dir] [--platform PLATFORM] [--source skill|mcp|all]` |
| Compare two skills | `diff <skill-a> <skill-b>` |
| Duplicate cleanup plan | `cleanup` |
| HTML health report | `dashboard [--report path]` |
| Install skill | `install <path|slug> [--target PLATFORM] [--link]` |
| Uninstall skill | `uninstall <name> [--target PLATFORM] [--force]` |

## Common workflows

Scan:

```bash
node /Users/evilstar/GitHub/skill-doctor/dist/index.cjs scan
```

Report total skills, platform/scope breakdown, duplicates, conflicts, and notable paths.

Conflicts:

```bash
node /Users/evilstar/GitHub/skill-doctor/dist/index.cjs conflicts --limit 10
```

Report highest severity pairs first, with shared tokens/overlap and suggested fix. Use `--kind duplicate` for duplicate-only checks.

Audit:

```bash
node /Users/evilstar/GitHub/skill-doctor/dist/index.cjs audit --severity high
```

Lead with HIGH findings. Then summarize MED/LOW counts if needed. `--ai` requires `~/.skill-doctor/config.json` analysis config.

Context cost:

```bash
node /Users/evilstar/GitHub/skill-doctor/dist/index.cjs cost --budget-tokens 2000
```

Report grade, total tokens/turn, over-budget status, top costly items, and fixes. Use `--platform codex`, `--scope project`, or `--source mcp` to narrow.

Dashboard:

```bash
node /Users/evilstar/GitHub/skill-doctor/dist/index.cjs dashboard --report skill-doctor-dashboard.html
```

Use for "full health check" or visual overview. Tell the user the output path. Avoid `--open` unless the user asks to open it.

Show/diff:

```bash
node /Users/evilstar/GitHub/skill-doctor/dist/index.cjs show <name>
node /Users/evilstar/GitHub/skill-doctor/dist/index.cjs diff <a> <b>
```

Use `show` for one skill's description, triggers, provenance, when-to-use, and related skills. Use `diff` for choosing between two similar skills.

Cleanup/install safety:

```bash
node /Users/evilstar/GitHub/skill-doctor/dist/index.cjs cleanup
```

`cleanup --execute`, `install`, and `uninstall` modify local files. Only run them when the user explicitly asks to change installs.

## Options to remember

- `--scope project|global|all`
- `--json`
- `--report [path]`
- `--fail-on high|med|low`
- `conflicts --strategy token|embedding --threshold N --analyze`
- `cost --platform-budget platform=N --fail-on-budget`

Platforms: `claude`, `cursor`, `copilot`, `codex`, `gemini`, `windsurf`, `trae`, `opencode`, `kiro`, `openclaw`, `hermes`, `unknown`. Aliases: `claudecode`, `claude-code`.

## Response shape

Start with the actionable result:

- Clean: "`N` items scanned; no conflicts/high-risk findings; context grade `X`."
- Risky: "Top issue: `<skill>` has HIGH `<rule>` at `<path>`."
- Costly: "Token tax is `<N>`/turn; top cost is `<file>`; fix: `<suggestion>`."

Then give only the top few details and offer the exact next command when useful.
