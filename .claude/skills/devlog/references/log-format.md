# DevLog Format Reference

## File Location
`doc/devlog/YYYY-MM-DD.md` — one file per day, in the project repo.

## Full Daily Log Template

```markdown
# Dev Log: YYYY-MM-DD

## Status
Branch: <branch-name>
Active Feature: <feature-id> — <feature-name>
Phase: <planning|implementing|testing|done>

## Commits

| SHA | Message | Requirement | Decisions |
|-----|---------|-------------|-----------|
| abc1234 | Short commit message | F2-S3 (Task 3.1) | [AI] Chose X over Y because Z |
| def5678 | Another commit | F1 | [human] Changed approach after review |

> Decision prefix: [AI] = made by Claude, [human] = made by developer, [joint] = discussed

## Completed Today
- Bullet list of meaningful units of work (not individual commits)
- Use spec task IDs when available: F2 Slice 3 Task 3.1 ✓

## Blockers / Open Questions
- Any unresolved issues or decisions pending (omit section if none)

## Progress State
One paragraph: where is the feature/project right now, what % done, what remains.

## Next Session
**Pick up at**: Concrete, actionable sentence — what to do first when opening this project next time.
**Context**: Any additional context needed (config required, environment setup, etc.)
```

## Requirement ID Conventions

Match to whatever the project uses in its spec files:
- Feature-level: `F1`, `F2`, `F3`
- Slice-level: `F2-S3` (Feature 2, Slice 3)
- Task-level: `F2-S3-T1` (Feature 2, Slice 3, Task 1)

If no formal spec IDs exist, use natural language: `auth/login-flow`.

## Commit → Requirement Mapping

To link a commit to requirements:
1. Read the commit message for feature/task keywords
2. Check `doc/specs/` or equivalent for matching specs
3. Check the task tracking board in the spec for which tasks are "in progress" or "pending"
4. Match by feature name, slice name, or task description keywords

## Auto-Log Format (from hook script)

The `scripts/auto-log.sh` writes a minimal raw entry:

```markdown
<!-- auto: 2026-05-12T21:03:14+0800 -->
- `46094e9` Implement Slice 3 (Optional AI Analysis) and Slice 5 (Calibration)
```

When `/devlog` is run, Claude enriches these raw entries into the full table format.
