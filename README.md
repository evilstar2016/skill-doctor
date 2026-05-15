# skill-doctor

Local CLI for diagnosing AI Agent skills — conflicts, security, duplicates, and drift.

```
$ skill-doctor scan

  Scanning skill directories...

  ~/.claude/skills/           12 skills
  ~/.cursor/rules/             8 skills
  .claude/skills/              5 skills

  ─────────────────────────────────────────────
  SKILL DOCTOR REPORT
  ─────────────────────────────────────────────

  Total skills installed:  25
  Duplicates detected:      2
  Conflicts detected:       3

  ⚠  git-workflow  ↔  github-automation  [HIGH  87%]
  ⚠  code-review   ↔  test-driven-dev   [MED   71%]
  ⚠  ppt-generator ↔  slide-maker       [MED   68%]

  → Run skill-doctor conflicts for details
```

## Why

Agent Skill ecosystems grow fast. You install skills from GitHub, from colleagues, from guides — and eventually your agent starts behaving inconsistently. The root cause is often two skills competing for the same trigger, or a duplicate installed in different paths, or a skill with suspicious instructions you never reviewed.

`skill-doctor` is `npm audit` for your skills. It doesn't install or distribute skills — it diagnoses the ones you already have.

## Installation

```bash
npm install -g skill-doctor
```

Or run without installing:

```bash
npx skill-doctor scan
```

Requires Node.js 20+.

## Commands

### `scan`

Discover all installed skills and show a health summary.

```bash
skill-doctor scan
skill-doctor scan --scope project          # project skills only
skill-doctor scan --scope global           # global skills only
skill-doctor scan --report                 # write skill-doctor-report.html
skill-doctor scan --report ./out/report.html
skill-doctor scan --json
```

### `show`

Inspect a single skill — description, triggers, when to use, related skills.

```bash
skill-doctor show git-workflow
skill-doctor show git-workflow --json
```

### `conflicts`

List skills with overlapping descriptions or trigger keywords.

```bash
skill-doctor conflicts
skill-doctor conflicts --kind duplicate    # exact name duplicates only
skill-doctor conflicts --kind conflict     # semantic overlaps only
skill-doctor conflicts --scope global
skill-doctor conflicts --limit 10
skill-doctor conflicts --fail-on high      # exit 1 if any HIGH conflicts (CI)
skill-doctor conflicts --analyze           # LLM-powered root cause (requires config)
```

**Detection strategies**

| Strategy | How it works | When to use |
|----------|-------------|-------------|
| `token` (default) | TF-IDF keyword overlap | Fast, no dependencies |
| `embedding` | Cosine similarity via local embedding model | More accurate, requires config |

```bash
skill-doctor conflicts --strategy embedding
skill-doctor conflicts --strategy embedding --threshold 0.75
```

### `audit`

Scan skills for security risks — credential exposure, destructive instructions, shell execution.

```bash
skill-doctor audit
skill-doctor audit --severity high         # high findings only
skill-doctor audit --fail-on med           # exit 1 on med+ (CI)
skill-doctor audit --report                # write skill-doctor-audit.html
skill-doctor audit --json
```

**Built-in rules**

| Rule | Severity | Detects |
|------|----------|---------|
| `shell-exec` | HIGH | Instructions to run shell commands (`bash -c`, `eval`, `subprocess`) |
| `destructive` | HIGH | Destructive operations (`rm -rf`, `DROP TABLE`, `wipe the database`) |
| `secret-leak` | MED | Instructions that output credentials, API keys, or passwords |
| `network-call` | LOW | Instructions that POST or upload to external URLs |

### `diff`

Compare two skills side by side — coverage, pros/cons, when to pick each.

```bash
skill-doctor diff git-workflow github-automation
skill-doctor diff git-workflow github-automation --report
```

With LLM analysis configured, `diff` adds coverage overlap, strengths/weaknesses, and situational recommendations.

### `cleanup`

Find duplicate skills across all paths and interactively remove the extras.

```bash
skill-doctor cleanup                       # show duplicates and suggested removals
skill-doctor cleanup --execute             # interactive: pick which copy to delete
skill-doctor cleanup --json
```

## Platform coverage

| Platform | Global path | Project path |
|----------|-------------|--------------|
| **Claude Code** | `~/.claude/skills/` | `.claude/skills/` |
| **Cursor** | `~/.cursor/rules/` | `.cursor/rules/`, `.cursorrules` |
| **GitHub Copilot** | `~/.copilot/skills/` | `.github/copilot-instructions.md`, `.github/instructions/` |
| **Codex** | `~/.codex/AGENTS.md` | `AGENTS.md` |
| **Gemini CLI** | `~/.gemini/skills/` | `.gemini/skills/`, `GEMINI.md` |
| **Windsurf** | `~/.codeium/windsurf/skills/` | `.windsurfrules` |
| **Kiro** | `~/.kiro/skills/` | `.kiro/skills/` |
| **Trae** | `~/.trae/skills/` | `.trae/skills/` |
| **OpenCode** | `~/.config/opencode/skills/` | `skills/`, `AGENTS.md` |

## CI integration

Use `--fail-on` to gate your pipeline on skill health:

```yaml
# .github/workflows/skill-check.yml
- name: Check skill conflicts
  run: npx skill-doctor conflicts --fail-on high

- name: Security audit
  run: npx skill-doctor audit --fail-on med
```

Use `--json` for custom reporting:

```bash
skill-doctor scan --json | jq '.summary'
skill-doctor audit --json | jq '.findings[] | select(.severity == "high")'
```

## Configuration

`~/.skill-doctor/config.json`

```json
{
  "embedding": {
    "baseUrl": "http://localhost:11434/v1",
    "model": "bge-m3",
    "apiKey": "optional"
  },
  "analysis": {
    "baseUrl": "https://api.openai.com/v1",
    "model": "gpt-4o-mini",
    "apiKey": "sk-...",
    "timeoutMs": 30000
  },
  "ignore": {
    "skillNames": ["legacy-skill"],
    "conflictPairs": [["skill-a", "skill-b"]]
  }
}
```

**`embedding`** — enables `--strategy embedding` for semantic conflict detection. Compatible with any OpenAI-format endpoint (Ollama, LM Studio, OpenAI, etc.).

**`analysis`** — enables `--analyze` on `conflicts` and powers the `diff` command with LLM-generated summaries and fix suggestions. Any OpenAI-compatible model works.

**`ignore`** — suppress known false positives. `skillNames` excludes a skill from all checks; `conflictPairs` suppresses a specific pair from conflict output.

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
