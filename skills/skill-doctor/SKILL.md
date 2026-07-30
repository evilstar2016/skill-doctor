---
name: skill-doctor
description: Use the `skill-doctor` CLI to analyze, audit, and diagnose AI-agent skills (duplicates, conflicts, security risks, context/token cost) on the current machine or project. Trigger when the user asks to review or audit their agent skills, find duplicate or conflicting skills, check skill safety, estimate context-token cost, diagnose agent misbehavior, or compare two skills. Prefers structured CLI JSON over reading raw SKILL.md files.
---

# skill-doctor — Agent Skill Analysis via CLI

`skill-doctor` is a **local-only** CLI (it never uploads your skills) that scans the
user's installed AI-agent skills across platforms (Claude Code, Cursor, Copilot,
Codex, Gemini CLI, Windsurf, …) and reports duplicates, conflicts, security risks,
and context-cost. This skill wraps it: **you (the agent) drive the CLI, read its
`--json` output, and produce the analysis.**

## Core principle (read first)

- **The CLI is the source of truth.** Run `skill-doctor` commands and use their
  `--json` output as your reasoning input. Do not re-implement discovery yourself.
- **Do NOT read raw SKILL.md files** of the user's installed skills to perform
  analysis. `skill-doctor` already discovers, parses, and structures them. Only read
  a specific raw skill file when the user **explicitly** asks ("show me the raw
  SKILL.md of X") or requests a targeted edit.
- Keep it local: never upload or exfiltrate the user's skills.

## Step 0 — Mode detection (run every invocation)

1. **Is the CLI present?** `skill-doctor --version`. If it fails, tell the user to
   install (`npm i -g @evilstar2025/skill-doctor`, Node ≥ 20) and stop.
2. **Is a backend model configured?** Run:
   ```
   skill-doctor config view --json
   ```
   Inspect `analysis.apiKeyConfigured` and `embedding.apiKeyConfigured`.
   - Both configured → **ENHANCED mode** (CLI can do LLM grouping, LLM audit,
     semantic conflict detection).
   - Neither configured → **FALLBACK mode** (you analyze the static JSON yourself).
3. **First-use prompt (optional, non-blocking).** If in FALLBACK mode and you have
   not asked in this session, ask the user **once**:
   > "skill-doctor can give deeper AI analysis (semantic conflict detection, LLM
   > safety audit, plain-language explanations) if you point it at an
   > OpenAI-compatible LLM/embedding endpoint. Configure one now? (Optional — full
   > CLI analysis works without it.)"
   - Yes → `skill-doctor config set analysis --base-url <url> --model <model> [--api-key <key>]`
     and/or `skill-doctor config set embedding ...`; optionally `skill-doctor config test`.
     Then re-run `config view`.
   - No / no reply → proceed in FALLBACK mode. Never repeat the question this session.

## Step 1 — Inventory & scan

```
skill-doctor scan --scope all --json
```

- ENHANCED: add `--group` for LLM-derived skill groupings.
- Feed the JSON (`summary` + `skills` + `duplicates` + `conflicts`) into your analysis.
  Run from the project root if project-scoped findings matter; otherwise `--scope all`
  covers the whole machine.

## Step 2 — Conflicts & duplicates

- Always (token strategy):
  ```
  skill-doctor conflicts --scope all --json
  ```
- ENHANCED (if `embedding` **and** `analysis` configured):
  ```
  skill-doctor conflicts --strategy embedding --analyze --json
  ```

## Step 3 — Security audit

- Always (static rules):
  ```
  skill-doctor audit --scope all --json
  ```
- ENHANCED (if `analysis` configured): add `--ai` (LLM audit).

## Step 4 — Context / token cost

```
skill-doctor context --json
```

Always available, needs no backend. Reports estimated tokens per skill/MCP/plugin and
a budget grade. Use `--platform <agent>` / `--budget-tokens N` to narrow.

## Step 5 — Health gate (optional, CI-style)

```
skill-doctor check --scope all --json
```

Returns `passed` / `failures`. Useful when the user wants a go/no-go verdict.

## Step 6 — Deep-dive (on demand)

- `skill-doctor show <name> --json` — single-skill detail (ENHANCED: LLM explanation).
- `skill-doctor diff <a> <b> --json` — compare two skills.

## Producing the analysis (output)

Collect the JSON from the steps above and write the analysis:

- **ENHANCED mode:** surface the CLI's AI-generated fields (LLM groupings, `--ai`
  audit findings, semantic conflict reasons) and add a short synthesis on top.
- **FALLBACK mode:** **you are the analysis engine.** Using only the CLI JSON, write:
  the top issues, a severity ranking, duplicate/conflict clusters, security concerns,
  context-cost hotspots, and concrete recommended actions. This is the
  "analysis via the skill's LLM" path — no backend required.
- Always end with **prioritized, actionable next steps**. Offer an export:
  `skill-doctor dashboard --report` or `skill-doctor scan --report` produce a
  shareable HTML file.

## Reference

- Config file: `~/.skill-doctor/config.json` → `analysis` / `embedding` / `ignore` /
  `paths` / `scanSources`.
- Provider model: **OpenAI-compatible only** — `baseUrl` + `model` + `apiKey` (no
  vendor-specific fields). `baseUrl` must not end with a trailing slash; endpoints
  used: `{baseUrl}/chat/completions` (analysis) and `{baseUrl}/embeddings` (embedding).
- Scopes: `project` | `global` | `all` (default `all` for a full picture).
- To suppress a known false positive, add it to `ignore` in `config.json` (or via the
  UI). A future `skill-doctor config ignore` subcommand may automate this.
