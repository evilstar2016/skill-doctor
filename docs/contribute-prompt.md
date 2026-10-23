# Contribute in one paste (English)

Copy the block below into Claude Code, Cursor, Codex, or any agent that can run shell commands.
The agent will inspect your setup, pick one contribution track, verify the change, and open a pull request.

You do not need to read the docs first. If the agent gets stuck, it will stop and tell you why.

---

```text
You are contributing to skill-doctor, a local-first CLI that audits AI agent skills, rules,
instruction files, and MCP configuration. Repo: github.com/evilstar2016/skill-doctor

Goal: land ONE small, verifiable contribution as a pull request.
Pick exactly one track below - the first one that applies. Do not do more than one.

Before anything:
- Run `npx @evilstar2025/skill-doctor scan` in this project and read the output.
- Run `npx @evilstar2025/skill-doctor audit` and `npx @evilstar2025/skill-doctor conflicts`.
- Read CONTRIBUTING.md, ADDING_PLATFORM.md, and .github/PULL_REQUEST_TEMPLATE.md.
- Create a branch: `git checkout -b contrib/<short-slug>`

TRACK A - report a false positive (fastest, no code)
Use this when scan, conflicts, or audit flags something that is actually fine.
- Pin down the exact command and the ruleId (shell-exec, destructive, secret-leak,
  network-call) or the conflict reason.
- Redact private paths, internal skill text, tokens, and customer data.
- File an issue using .github/ISSUE_TEMPLATE/false_positive.yml:
  Command / Finding / Expected behavior / skill-doctor version.
- Do NOT open a pull request for this track. The issue is the deliverable.

TRACK B - add a missing platform adapter
Follow ADDING_PLATFORM.md end to end. In short:
1. Add the lowercase platform id to `Platform` in `src/types/skill.ts`.
2. Create `src/platforms/adapters/<agent>.ts` exporting one `PlatformAdapter`.
3. Register it in `src/platforms/adapters/index.ts`.
4. Add the smallest possible fixtures under `tests/fixtures`.
5. Update the tests named in ADDING_PLATFORM.md step 5.
Constraints:
- Declare `installTargets` only for documented, writable `skill-dirs` paths.
  Discovery-only, `costOnly`, single-file, and system-owned paths must not become deployable.
- Do not add `platform === '<name>'` branches to generic discovery or config modules.
  If special behavior is needed, add an adapter hook instead.
- If the global or project path is not documented by the vendor, mark `confidence: 'low'`
  and say so in the PR body.

TRACK C - add an audit rule
1. Add a `RuleId` member in `src/types/audit.ts`.
2. Add one entry to `RULES` in `src/audit/rules.ts`:
   `{ ruleId, severity: 'high' | 'med' | 'low', label, patterns: RegExp[] }`
3. Add coverage under `tests/audit/` (extend `runAudit.test.ts` or add a focused file)
   with at least one true positive AND one near-miss that must NOT match.
4. Keep patterns specific. A rule that fires on ordinary prose is worse than no rule.

Hard rules:
- Never upload, paste, or commit private skill content, API keys, tokens, or customer data.
- Keep the diff minimal. Do not reformat, refactor, or "improve" unrelated code.
- No new dependencies unless the contribution is impossible without one - ask first.
- Do not change default behavior to upload, delete, or modify anything outside the repo.

Verify before opening the pull request. All of these must pass:
  npm ci
  npm test
  npm run typecheck:ui
  npm run build
  npm run check:project
  git diff --check

Then open a pull request titled one of:
  feat(platform): <name>
  feat(audit): <rule-id>
  fix: <what you fixed>
The body must state: what changed and why, the exact commands you ran to verify,
and one redacted sample of the output that changed.

If a step is blocked - missing vendor docs, ambiguous paths, a failing test that already
failed before your change - stop and report the blocker. Do not guess and do not skip tests.
```

---

## What the three tracks actually are

| Track | What you get | Repo artifact | Needs code |
|---|---|---|---|
| A · false positive | A triaged issue with a reproducible case | `.github/ISSUE_TEMPLATE/false_positive.yml` | No |
| B · platform adapter | Support for your agent or editor | `src/platforms/adapters/<agent>.ts` | Yes |
| C · audit rule | A new class of risky instruction gets caught | `src/types/audit.ts` + `src/audit/rules.ts` | Yes |

All three already exist as real paths - `infcode` was added through Track B, and the four
current rules were added through Track C. Nothing here is hypothetical.

## Safety

The prompt tells the agent to redact before reporting and never to upload skill content.
Review the diff yourself before pushing. `skill-doctor` is local-first by design: no step in
this workflow requires sending your skills anywhere.
