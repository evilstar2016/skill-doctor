---
name: test-all-paths
description: Full code-path coverage discipline for renderers, CLI commands, and file-output features. Use when implementing a new output command, renderer, or any feature with multiple distinct output branches. Prevents the "only zero-findings path tested" class of bug.
---

# Test All Paths

## The Core Mistake

A new command or renderer passes all tests — but only because the tests never trigger the
interesting branch. The feature ships. The untested path is broken.

Classic example from this project: `audit --report` was implemented and tested. Tests passed.
The findings table code path had **never run** — all tests used a zero-findings fixture.

The bug isn't in the code. It's in the test design.

## Before Writing a Single Test

Map every distinct output state the code can produce. For a renderer or CLI command:

1. **Enumerate branches** — what conditions produce structurally different output?
   - Empty vs non-empty state (no findings vs 1+ findings)
   - Each severity level present vs absent
   - Optional fields present vs missing (provenance `undefined`)
   - Error vs success path
   - Default vs explicit arguments

2. **For each branch, ask**: what data forces exactly this path and nothing else?

3. **Write that data first.** Then write the test against it.

If you can't describe what data forces a branch, you don't understand the branch yet.

## Test Data Discipline

### Fixture files for persistent demo/test data

When a feature needs real discoverable data (e.g., skills a CLI command actually scans):

- Name with a clear prefix: `danger-demo-*`, `audit-fixture-*`, `test-only-*`
- Add a marker in the description field: `[DANGER-DEMO]`, `[TEST-FIXTURE]`
- Put a comment in the file body explaining why it exists
- Keep fixture content minimal — just enough to trigger the target branch

```markdown
---
name: danger-demo-shell-exec
description: "[DANGER-DEMO] You must run the bash command to deploy."
---
# Deploy Helper (DANGER DEMO — triggers shell-exec rule)
> This skill exists to demonstrate the audit command.
```

### Inline data for unit tests

For renderer unit tests, build the `AuditResult` / data struct directly in the test.
Don't read fixture files from disk in unit tests — that couples test reliability to file layout.

```ts
// RIGHT — unit test owns its data
const result: AuditResult = {
  scanned: 4,
  findings: [
    { ruleId: 'shell-exec', severity: 'high', skillName: 'demo', ... },
    { ruleId: 'secret-leak', severity: 'med', skillName: 'other', ... },
  ],
  summary: { high: 1, med: 1, low: 0 },
};

// WRONG — unit test depends on file layout
const skills = await scanSkills('./tests/fixtures');
```

## HTML / File Output Tests

When the feature writes a file, the integration test must **read and assert the file**.
Checking stdout alone leaves the entire file contents untested.

```ts
// RIGHT
const result = runCli(['audit', '--report', reportPath], cwd, home);
expect(result.stdout).toContain(`Audit report written to: ${reportPath}`);

const html = readFileSync(reportPath, 'utf8');
expect(html).toContain('danger-demo-shell-exec');  // actual content verified
expect(html).toContain('badge badge-high');

// WRONG — only stdout tested, file content never verified
expect(result.status).toBe(0);
expect(result.stdout).toContain('Audit report written to');
```

## CSS Class Names vs Rendered Elements

When asserting presence or absence of UI elements in HTML output, target the
**rendered element**, not the CSS definition.

```ts
// WRONG — '.badge-high { ... }' is in the <style> block, always present
expect(html).not.toContain('badge-high');

// RIGHT — this only appears when an actual element is rendered
expect(html).not.toContain('badge badge-high');
expect(html).not.toContain('<span class="badge badge-high">');
```

Same trap applies to any string that appears in: CSS classes, template comments,
`data-*` attributes, or `aria-*` labels — always assert the smallest unique
discriminator that can only appear when the branch actually executed.

## Workflow

### Step 1 — Branch map

Before any code, list every output branch:

```
audit --report:
  [A] zero findings    → "No findings — all skills passed." table row
  [B] 1+ findings      → findings table with badge + rule + provenance columns
  [C] default path     → file named skill-doctor-audit.html in cwd
  [D] explicit path    → file written to given path
  [E] --json flag      → no file written, JSON to stdout
```

### Step 2 — Assign test data to each branch

| Branch | Forces it | Test type |
|--------|-----------|-----------|
| A | `AuditResult` with empty `findings` | Unit |
| B | `AuditResult` with 1 finding per rule | Unit |
| C | `runCli(['audit', '--report'])` | Integration |
| D | `runCli(['audit', '--report', path])` | Integration |
| E | existing `--json` test | Integration |

### Step 3 — Tracer bullet

Pick the most representative branch (usually the non-empty/success case).
Write one test → make it pass → confirm the branch actually ran.

### Step 4 — Cover remaining branches

One test per branch. Each test should fail if you comment out the code it exercises.

### Step 5 — Verify coverage by inspection

After all tests pass, re-read the renderer/handler and ask for each `if` branch:
"Which test fails if I delete this branch?" If the answer is "none", add a test.

## Checklist

```
[ ] Branch map written before first test
[ ] Each branch has exactly one forcing test-data setup
[ ] HTML/file tests read and assert the artifact, not just stdout
[ ] Absence assertions target rendered elements, not CSS class names
[ ] Each test would fail if its target branch were deleted
[ ] Fixture files named with prefix + description marker
[ ] Integration test fixtures placed in .claude/skills/ or tests/fixtures/
    with naming convention that distinguishes them from real skills
```
