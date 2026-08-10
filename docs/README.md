# skill-doctor Reference

<p align="center">
  <a href="./README.zh-CN.md"><strong>📘 中文文档 (Chinese)</strong></a>
</p>

> 👉 Want to see it in action? Open the **[interactive HTML manual](./pages/manual.html)** — real terminal screenshots and a UI walkthrough for every command, with a 中文/EN toggle.

> `skill-doctor` is a local CLI that audits skills installed by AI coding assistants (Claude Code / Codex / Copilot / Cursor / ACA, etc.): duplicates, conflicts, security risks, and context cost. Every command accepts `--json` for machine-readable output, convenient for CI.

This reference mirrors the [bilingual HTML manual](./pages/manual.html); each command below covers **Scenario / Usage / Effect**.

**Conventions:** use `--scope project` to limit the scan to the current repo; `--json` emits machine-readable output. The examples run against a sample project that contains 1 duplicate skill, so "data-exporter has 2 copies" appears in several places.

---

## Command overview

| Command | Purpose |
| --- | --- |
| `install` / run | Install the CLI and print the version |
| `--help` | List all commands and flags |
| `scan` | Inventory installed skills |
| `show <name>` | Inspect a single skill |
| `conflicts` | Detect duplicates & conflicts |
| `audit` | Security audit |
| `check` | One-shot health gate (best for CI) |
| `cleanup` | Remove duplicate skills |
| `cost` / `context` | Estimate context cost |
| `diff <a> <b>` | Compare two skills |
| `ui` | Launch the web dashboard |
| `dashboard` | Export a static overview report |
| `install` / `uninstall` | Install & uninstall skills |
| `center` | Unified skill center |
| `config` | Configure analysis / embedding models |

---

## Install & Run

- **Scenario**
  - Install it once and use it in any project directory.
- **Usage**
  ```bash
  npm i -g @evilstar2025/skill-doctor
  npx @evilstar2025/skill-doctor <cmd>   # run without installing
  skill-doctor --version                 # print version
  ```
- **Flags**
  | Flag | Description |
  | --- | --- |
  | `npm i -g @evilstar2025/skill-doctor` | Install globally, then use the `skill-doctor` command directly. |
  | `npx @evilstar2025/skill-doctor <cmd>` | Run a command on the fly without installing. |
  | `skill-doctor --version` | Print the version. |
- **Notes**
  - Requires Node.js ≥ 20. Every command accepts `--json` for machine-readable output, convenient for CI.

---

## `--help` — Overview

- **Scenario**
  - First time, or forgot a sub-command/flag? Check `--help` first; it lists every command and option.
- **Usage**
  ```bash
  skill-doctor --help
  ```
- **Flags**
  | Flag | Description |
  | --- | --- |
  | `-h / --help` | Works for any sub-command too, e.g. `skill-doctor conflicts --help`. |
  | `-v / --version` | Print just the version. |

---

## `scan` — Inventory installed skills

- **Scenario**
  - When you want to know which skills are installed, on which platforms, and whether any duplicates/conflicts exist — run `scan` first.
- **Usage**
  ```bash
  skill-doctor scan --scope project
  ```
- **Flags**
  | Flag | Description |
  | --- | --- |
  | `--scope project\|global\|all` | Scan scope; default `all`. The sample uses `project` to only look at the current repo. |
  | `--group` | Group skills by topic via an LLM (requires a configured analysis model). |
  | `--strategy token\|embedding` | Conflict-detection strategy; default `token` (local, offline). |
  | `--report [path]` | Also export a visual HTML report. |
  | `--json` | Emit structured JSON for scripting. |
- **Notes**
  - `scan` lists skills per platform and flags duplicates; `--report` writes `scan-report.html` (a real sample ships at `docs/pages/scan-report.sample.html`).

---

## `show <name>` — Inspect one skill

- **Scenario**
  - After scanning, drill into one skill: source path, description, trigger conditions, and similar skills.
- **Usage**
  ```bash
  skill-doctor show data-exporter
  ```
- **Flags**
  | Flag | Description |
  | --- | --- |
  | `<name>` | Skill name (required), e.g. `data-exporter`. |
  | `--json` | Emit structured JSON. |
- **Notes**
  - `RELATED SKILLS` reports similarity with other copies — the lead to follow for duplicate/conflict investigations.

---

## `conflicts` — Detect duplicates & conflicts

- **Scenario**
  - When you suspect same-named or highly similar skills across platforms/directories, `conflicts` finds them and suggests "delete which, keep which".
- **Usage**
  ```bash
  skill-doctor conflicts --scope project
  ```
- **Flags**
  | Flag | Description |
  | --- | --- |
  | `--scope project\|global\|all` | Scan scope, default `all`. |
  | `--kind duplicate\|conflict\|all` | Filter by kind: `duplicate` = exact same name, `conflict` = semantically similar. |
  | `--fail-on high\|med\|low` | Exit with code 1 once severity reaches the threshold — for CI gating. |
  | `--limit N` | Show at most N results. |
  | `--strategy / --threshold / --embedding-model` | Same as `scan`, controls detection precision. |
- **Notes**
  - In CI, add `--fail-on high` so any duplicate fails the build.

---

## `audit` — Security audit

- **Scenario**
  - Before shipping skills, check for obvious security risks (dangerous shell, suspicious network calls). Without `--ai`, runs on local rules with zero config.
- **Usage**
  ```bash
  skill-doctor audit --scope project
  ```
- **Flags**
  | Flag | Description |
  | --- | --- |
  | `--scope project\|global\|all` | Scan scope, default `all`. |
  | `--severity high\|med\|low` | Only show findings of this severity or higher. |
  | `--ai` | Use the analysis model for a deeper scan (run `config set analysis` first). |
  | `--no-cache` | Ignore the AI audit cache and re-analyze. |
  | `--report [path]` | Export a visual HTML audit report. |

---

## `check` — One-shot health gate (best for CI)

- **Scenario**
  - In CI/pre-commit, run one command that combines security, conflicts, and context-budget checks and returns pass/fail with an exit code. More convenient than running `audit` + `conflicts` + `cost` separately.
- **Usage**
  ```bash
  skill-doctor check --scope project --fail-on high
  ```
- **Flags**
  | Flag | Description |
  | --- | --- |
  | `--scope project\|global\|all` | Scan scope, default `all`. |
  | `--fail-on high\|med\|low` | Severity threshold; default `high`; exit 1 when reached. |
  | `--budget-tokens N` | Per-turn token budget; over-budget counts as failure. |
  | `--json` | Emit structured output for pipelines. |
- **Notes**
  - A single duplicate makes the check fail — perfect as a pre-merge gate.

---

## `cleanup` — Remove duplicate skills

- **Scenario**
  - Once `conflicts` reports duplicates, `cleanup` lists every copy and can interactively remove them with `--execute`, tidying up disk and context.
- **Usage**
  ```bash
  skill-doctor cleanup --scope project
  ```
- **Flags**
  | Flag | Description |
  | --- | --- |
  | `--scope project\|global\|all` | Scan scope, default `all`. |
  | `--execute` | Enter interactive mode to pick deletions (default is listing only). |
  | `--json` | Emit the cleanup list as JSON. |
- **Notes**
  - Without `--execute`, this is a safe read-only preview.

---

## `cost` / `context` — Estimate the context tax

- **Scenario**
  - Skills, MCP servers, and Agent config silently inflate every conversation, eating tokens and money. `cost` breaks down per-turn tokens and grades against budget; the `context` sub-command can enable/disable Codex resources.
- **Usage**
  ```bash
  skill-doctor cost --scope project
  skill-doctor context enable --id <id>   # toggle a Codex resource
  ```
- **Flags**
  | Flag | Description |
  | --- | --- |
  | `[project-dir]` | Project dir to analyze (default: current). |
  | `--platform <p>` | Limit to a platform (claude/codex/copilot/...). |
  | `--source skill\|mcp\|all` | Restrict to skills / MCP / all. |
  | `--budget-tokens N` | Per-turn budget; over-budget rows flagged. |
  | `--fail-on-budget` | Exit 1 when over budget. |
  | `--tokenizer openai\|approx` | Tokenizer; default `openai` (precise). |

---

## `diff <a> <b>` — Compare two skills

- **Scenario**
  - To know exactly how two skills differ (merge, replace, or the same thing renamed), `diff` lays out fields and triggers side by side.
- **Usage**
  ```bash
  skill-doctor diff data-exporter code-reviewer
  ```
- **Flags**
  | Flag | Description |
  | --- | --- |
  | `<skill-a> <skill-b>` | Two skill names (required). |
  | `--report [path]` | Export a visual HTML comparison report. |
- **Notes**
  - Without a model, `diff` falls back to "fields only" mode; with a model it also gives a semantic interpretation.

---

## `ui` — Launch the web dashboard

- **Scenario**
  - Prefer a clickable web UI — overview, conflicts, context cost, skill library at a glance. `ui` starts a local web server with session auth.
- **Usage**
  ```bash
  skill-doctor ui --port 4173 --no-open
  ```
- **Flags**
  | Flag | Description |
  | --- | --- |
  | `[project-dir]` | Project dir to analyze (default: current). |
  | `--port N` | Listen port; default: random. |
  | `--no-open` | Do not auto-open the browser (the server still starts). |
- **Notes**
  - After starting, it prints a local URL with a session token; open it in a browser to use the full UI; press Ctrl+C to stop. See [docs/index.html](./index.html) for UI screenshots.

---

## `dashboard` — Export a static overview report

- **Scenario**
  - Don't want a server — just export a single-file HTML overview (skills, conflicts, audit, duplicates, cleanup) to share or commit.
- **Usage**
  ```bash
  skill-doctor dashboard --scope project --report dashboard.html
  ```
- **Flags**
  | Flag | Description |
  | --- | --- |
  | `--scope project\|global\|all` | Scan scope, default `all`. |
  | `--report [path]` | Export HTML; default `dashboard.html`. |
  | `--open` | Auto-open after generation. |
- **Notes**
  - A real sample ships at `docs/pages/dashboard.sample.html`.

---

## `install` / `uninstall` — Manage skills

- **Scenario**
  - Install a local skill dir (or marketplace slug) into a platform dir, then uninstall later. Both are recorded in the unified skill center (`center.json`).
- **Usage**
  ```bash
  skill-doctor install ./skills/my-skill --target claude
  skill-doctor uninstall my-skill --target claude
  ```
- **Flags**
  | Flag | Description |
  | --- | --- |
  | `<path\|slug>` | Local path or slug (required). |
  | `--target <platform>` | Target platform; auto-detected when omitted. |
  | `--link` | Install as a symlink (for development). |
  | `uninstall <name> --target <p>` | Uninstall a skill by name. |
  | `--force` | Force uninstall even if other references remain. |

---

## `center` — The unified skill center

- **Scenario**
  - `skill-doctor` uses `center.json` as the single source of truth. Legacy data must be migrated once; `show` prints the whole picture.
- **Usage**
  ```bash
  skill-doctor center migrate
  skill-doctor center show
  ```
- **Flags**
  | Flag | Description |
  | --- | --- |
  | `center migrate` | Migrate legacy data to `center.json` (idempotent, safe to re-run). |
  | `center show` | Print the entire `center.json` as JSON. |

---

## `config` — Configure models

- **Scenario**
  - To unlock AI-enhanced features (`show` semantic interpretation, `conflicts` embedding strategy, `audit --ai`, `diff` semantic diff), first configure an OpenAI-compatible analysis model in `~/.skill-doctor/config.json` (optionally an embedding model too).
- **Usage**
  ```bash
  skill-doctor config set analysis --base-url https://api.example.com/v1 --model gpt-4o
  ```
- **Flags**
  | Flag | Description |
  | --- | --- |
  | `config view` | View current config status. |
  | `config set analysis\|embedding --base-url <url> --model <m>` | Set model endpoint and name. |
  | `--api-key <key>` | Set API key (or use an env var). |
  | `--clear-api-key` | Clear the stored key. |
  | `config test [--service analysis\|embedding]` | Connectivity self-test. |
- **Notes**
  - Once configured, `show`, `conflicts --strategy embedding`, `audit --ai`, and `diff` gain smart features.

---

> For full screenshots and real terminal output, see the [HTML manual](./pages/manual.html).
