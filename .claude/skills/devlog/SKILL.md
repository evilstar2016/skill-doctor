---
name: devlog
description: >
  Development log and requirement traceability tracker. Maintains daily
  doc/devlog/YYYY-MM-DD.md files that link git commits to requirements,
  capture AI vs human decisions, and provide session context recovery.

  TRIGGER when:
  (1) User runs /devlog or asks to write/update the dev log
  (2) User asks "what was I working on", "where did I leave off", or "show progress"
  (3) After a git commit when user wants to record it
  (4) User wants to generate a weekly summary or progress report
  (5) User asks to trace a requirement to its implementation or vice versa
---

# DevLog Skill

## Log Location
`doc/devlog/YYYY-MM-DD.md` — one file per day, committed with the code.

For log format details, see [references/log-format.md](references/log-format.md).

## Workflow: Manual `/devlog` (full enrichment)

Run this at end of a development session or whenever the user invokes `/devlog`.

### Step 1 — Gather raw data
```bash
git log --since="$(date +%Y-%m-%d) 00:00" --format="%h|%s|%ad|%an" --date=format:"%H:%M"
```
If today has no commits, look at the last 2 days.

### Step 2 — Read requirement context
- Check `doc/devlog/YYYY-MM-DD.md` if it already exists (from auto-log)
- Check `doc/specs/` or equivalent for active features and task status
- Look for task board tables (e.g., `| Slice | Status |`) to find what's in-progress/pending

### Step 3 — Link commits to requirements
For each commit, identify the requirement ID by matching:
- Feature codes in the message: `F1`, `F2`, `Slice 3`, etc.
- Spec task keywords: look up `doc/specs/` for matching task descriptions
- Prefix unknown commits with `(unlinked)` rather than guessing

### Step 4 — Classify decisions
For each significant implementation choice in today's commits, mark it:
- `[AI]` — Claude proposed and implemented this approach
- `[human]` — Developer made this call explicitly
- `[joint]` — Discussed and decided together

Only record non-obvious decisions. Skip "added test", "fixed typo" level commits.

### Step 5 — Write the log
Create or overwrite `doc/devlog/YYYY-MM-DD.md` using the format in `references/log-format.md`.

The "Next Session" section is the most important — write it as a concrete action the developer can take immediately when they open this project next time.

### Step 6 — Confirm and optionally commit
Show the written log to the user. Ask if they want to commit:
```bash
git add doc/devlog/ && git commit -m "chore: update devlog YYYY-MM-DD"
```

---

## Workflow: Session Start (context recovery)

When user says "继续开发", "where did I leave off", or starts a new session:

1. Find the most recent devlog: `ls doc/devlog/ | sort | tail -3`
2. Read the latest file, especially the **Next Session** and **Progress State** sections
3. Show a 3-5 line summary: what was done, what's pending, what to do next
4. Do NOT start implementing until the user confirms the direction

---

## Workflow: Auto-log Setup

The `scripts/auto-log.sh` script writes a lightweight raw entry after each commit.

### Option A: Claude Code PostToolUse hook (recommended)
Add to project `.claude/settings.json`:
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "bash /Users/evilstar/.claude/skills/devlog/scripts/auto-log.sh 2>/dev/null || true"
      }]
    }]
  }
}
```

### Option B: git post-commit hook
```bash
cp /Users/evilstar/.claude/skills/devlog/scripts/auto-log.sh .githooks/post-commit
git config core.hooksPath .githooks
```

Auto-log creates raw stub entries. Run `/devlog` to enrich them with requirement links and decisions.

---

## Workflow: Requirement Traceability Query

When user asks "which commit implements requirement X?" or "what requirement does commit Y address?":

1. Read the relevant devlog files in `doc/devlog/`
2. Search for the requirement ID or commit SHA in the logs
3. If not found in logs, fall back to: `git log --grep="<keyword>" --oneline`
4. Report: requirement → spec task → commit SHA(s) → files changed

---

## Weekly Summary

When user asks for a weekly summary or progress report:

1. Read all devlog files for the past 7 days
2. Aggregate completed items by feature/requirement
3. Count commits, list key decisions
4. Format as a brief report suitable for a standup or status update
