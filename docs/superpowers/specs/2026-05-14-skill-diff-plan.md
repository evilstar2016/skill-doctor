# Implementation Plan: `skill-doctor diff`

**Spec:** `2026-05-14-skill-diff-design.md`  
**Date:** 2026-05-14

## Steps

### Step 1 — Types (`src/diff/types.ts`)
Define `SkillProfile` and `DiffResult` interfaces.  
Verify: TypeScript compiles with no errors.

### Step 2 — Profile extraction (`src/diff/runDiff.ts`, partial)
Write `extractSkillProfile(record: SkillRecord): SkillProfile` using already-parsed `SkillRecord` fields (`name`, `description`, `rawContent`, triggers from `extractTriggers`).  
Verify: unit test with a fixture SKILL.md produces correct `SkillProfile`.

### Step 3 — LLM analysis (`src/diff/analyzeDiff.ts`)
Write `analyzeDiff(a: SkillProfile, b: SkillProfile, opts): Promise<DiffResult['analysis']>` using `callJsonLlm` from `src/explain/llmExplain.ts`.  
Prompt instructs LLM to return the `DiffResult.analysis` JSON shape exactly.  
Verify: integration test with two fixture skills + mocked `callJsonLlm` returns valid shape.

### Step 4 — Orchestration (`src/diff/runDiff.ts`, complete)
Wire together:
1. Discover both skills via `scanSkills` + name match
2. `parseSkill` each
3. `extractSkillProfile` each
4. `analyzeDiff`
5. Return `DiffResult`

Error handling: not-found, same-name, LLM failure (partial result).  
Verify: integration test end-to-end with `.claude/test-skills/` fixtures.

### Step 5 — Terminal renderer (`src/render/renderDiff.ts`)
Render `DiffResult` to stdout: header box, trigger section, coverage section, pros/cons section, situational advice section.  
Verify: snapshot test against known `DiffResult` fixture.

### Step 6 — HTML renderer (`src/render/renderDiffReport.ts`)
Render `DiffResult` to HTML string following `renderAuditReport.ts` style.  
Write file to `--report` path.  
Verify: output is valid HTML with all sections present.

### Step 7 — CLI wiring (`src/cli/index.ts`)
Add `diff` branch: parse two positional args + optional `--report <path>`.  
Call `runDiff`, then `renderDiff` or `renderDiffReport`.  
Verify: `npm run build` passes; `node dist/index.cjs diff --help` works.

### Step 8 — Full test pass
Run `npm test`. All existing tests must still pass.

## Success Criteria

- `skill-doctor diff <a> <b>` prints structured comparison to terminal
- `skill-doctor diff <a> <b> --report out.html` writes valid HTML report
- LLM failure degrades gracefully (rule-based sections still render)
- All pre-existing tests pass
- `npm run build` clean

## Files Touched

| File | Action |
|------|--------|
| `src/diff/types.ts` | create |
| `src/diff/runDiff.ts` | create |
| `src/diff/analyzeDiff.ts` | create |
| `src/render/renderDiff.ts` | create |
| `src/render/renderDiffReport.ts` | create |
| `src/cli/index.ts` | edit (add `diff` branch) |
| `tests/diff/` | create (unit + integration + snapshot) |
