---
name: skill-doctor
description: Diagnose locally installed Agent Skills. Scan what's installed across all platforms, detect conflicts between skills, and audit for security risks. Use when the user asks about their installed skills, skill conflicts, or skill safety.
---

# Skill Doctor

Runs the skill-doctor CLI to inspect the user's locally installed Agent Skills.

**Binary:** `node /Users/evilstar/GitHub/skill-doctor/dist/index.cjs`

## When to use

- "scan my skills" / "what skills do I have" / "list my skills"
- "check for skill conflicts" / "do my skills conflict" / "any overlapping skills"
- "audit my skills" / "are my skills safe" / "skill security check"
- "show skill [name]" / "explain skill [name]"
- "full health check" / "diagnose my skills"

## Workflows

### 1. Scan (default — show what's installed)

```bash
node /Users/evilstar/GitHub/skill-doctor/dist/index.cjs scan --json
```

From the JSON, report:
- Total skills installed, breakdown by platform and scope (global vs project)
- Number of duplicates and conflicts detected
- List of skill names grouped by platform

### 2. Conflict check

```bash
node /Users/evilstar/GitHub/skill-doctor/dist/index.cjs conflicts --json
```

From the JSON, report each conflict pair:
- Skill names and their similarity score
- Kind: `conflict` (overlapping triggers) or `duplicate` (same skill installed twice)
- Shared tokens that caused the overlap
- Any remediation suggestions if present

### 3. Security audit

```bash
node /Users/evilstar/GitHub/skill-doctor/dist/index.cjs audit --json
```

From the JSON, report findings grouped by severity:
- HIGH findings first — name, rule triggered, and the matched text
- MED and LOW findings as a summary count
- Provenance info for any flagged skills (where they came from)

### 4. Show specific skill

```bash
node /Users/evilstar/GitHub/skill-doctor/dist/index.cjs show <NAME>
```

Present the skill's description, triggers, provenance, and "when to use" explanation.

### 5. Full health check

Run all three in sequence (scan → conflicts → audit) and summarize everything in one response. Flag the most urgent issues first.

## Output guidance

- Lead with the most actionable finding (conflicts or HIGH audit findings take priority)
- If everything looks clean, say so explicitly ("27 skills found, no conflicts, no high-risk findings")
- For conflicts, always explain *why* they conflict — shared tokens or semantic overlap
- Keep the response concise; offer to drill deeper on any specific skill on request
