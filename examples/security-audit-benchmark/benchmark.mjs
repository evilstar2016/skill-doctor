import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const hash = (text) => createHash('sha256').update(text).digest('hex');
const templates = [
  { family: 'ownership', variant: 'original', vulnerable: true, sink: 'return rows[id];', source: `export function readInvoice(user, id, rows) {\n  return rows[id];\n}\n` },
  { family: 'ownership', variant: 'patched', vulnerable: false, source: `export function readInvoice(user, id, rows) {\n  const row = rows[id];\n  if (!row || row.owner !== user) return null;\n  return row;\n}\n` },
  { family: 'ownership', variant: 'control', vulnerable: false, source: `export function readInvoice(user, id, rows) {\n  const allowed = Object.values(rows).filter(row => row.owner === user);\n  return allowed.find(row => row.id === id) ?? null;\n}\n` },
  { family: 'export-path', variant: 'original', vulnerable: true, sink: 'return readFileSync(join(directory, name),', source: `import { join } from 'node:path';\nimport { readFileSync } from 'node:fs';\nexport function readExport(directory, name) {\n  return readFileSync(join(directory, name), 'utf8');\n}\n` },
  { family: 'export-path', variant: 'patched', vulnerable: false, source: `import { resolve, sep } from 'node:path';\nimport { readFileSync } from 'node:fs';\nexport function readExport(directory, name) {\n  const base = resolve(directory);\n  const path = resolve(base, name);\n  if (!path.startsWith(base + sep)) return null;\n  return readFileSync(path, 'utf8');\n}\n` },
  { family: 'export-path', variant: 'control', vulnerable: false, source: `import { join } from 'node:path';\nimport { readFileSync } from 'node:fs';\nexport function readExport(directory, name) {\n  const files = new Map([['monthly', 'monthly.txt']]);\n  const file = files.get(name);\n  if (!file) return null;\n  return readFileSync(join(directory, file), 'utf8');\n}\n` },
];

export function prepare(destination) {
  const directory = resolve(destination);
  if (existsSync(directory)) throw new Error('Use a new, empty run path.');
  const target = join(directory, 'target');
  mkdirSync(target, { recursive: true });
  const cases = templates.map((item) => {
    const file = `module-${randomUUID()}.mjs`;
    writeFileSync(join(target, file), item.source);
    return { file, family: item.family, variant: item.variant, vulnerable: item.vulnerable, sha256: hash(item.source), sinkLine: item.sink ? item.source.split('\n').findIndex((line) => line.includes(item.sink)) + 1 : null };
  });
  writeFileSync(join(target, 'CONTEXT.md'), `# Module contracts\nEach module is a separate implementation. Review each one independently.\nreadInvoice receives a trusted user identity, an untrusted invoice id and a trusted in-memory record store. It may return only invoices owned by that user.\nreadExport receives a trusted directory and an untrusted name. It may read only existing regular files inside that directory. The directory and its files are operator-managed and contain no symlinks.\nThese modules run in a single-tenant process; cross-tenant object prototype mutation is out of scope.\n`);
  const oracle = { version: 1, runId: randomUUID(), target, contextSha256: hash(readFileSync(join(target, 'CONTEXT.md'), 'utf8')), cases };
  writeFileSync(join(directory, 'oracle.json'), JSON.stringify(oracle, null, 2));
  writeFileSync(join(directory, 'TASK.md'), `Audit only ${target}. Follow the pinned Cloudflare security-audit workflow. Do not read the parent directory, benchmark generator, oracle or earlier reports. Discover defects yourself, independently verify each candidate, and retain raw Agent transcripts, coverage ledger and findings.json. Do not change target files. Apply the upstream sandbox rules before running target code. Mark blocked evidence needs_validation. Findings must use target-relative file paths. Write output outside target.\n`);
  return { target, runId: oracle.runId, cases: cases.length, task: join(directory, 'TASK.md') };
}

export function grade(runDirectory, findingsFile) {
  const directory = resolve(runDirectory);
  const oracle = JSON.parse(readFileSync(join(directory, 'oracle.json'), 'utf8'));
  const findings = JSON.parse(readFileSync(findingsFile, 'utf8'));
  const assets = join(root, 'assets/security-audit');
  const validator = createRequire(join(assets, 'validate-findings.cjs'))('./validate-findings.cjs');
  const errors = validator.validateDocument(findings, JSON.parse(readFileSync(join(assets, 'report-schema.json'), 'utf8')));
  if (errors.length) throw new Error(`Invalid upstream findings: ${errors.slice(0, 3).join('; ')}`);
  for (const item of oracle.cases) {
    if (hash(readFileSync(join(oracle.target, item.file), 'utf8')) !== item.sha256) throw new Error('Target changed after preparation. Start a new run.');
  }
  if (hash(readFileSync(join(oracle.target, 'CONTEXT.md'), 'utf8')) !== oracle.contextSha256 || JSON.stringify(readdirSync(oracle.target).sort()) !== JSON.stringify(['CONTEXT.md', ...oracle.cases.map((c) => c.file)].sort())) throw new Error('Target inventory or contract changed. Start a new run.');
  const confirmed = findings.filter((f) => f.verdict === 'confirmed');
  const matched = new Set();
  const unmatched = [];
  for (const finding of confirmed) {
    const item = oracle.cases.find((entry) => entry.vulnerable && finding.trace.some((trace) => trace.kind === 'sink' && trace.file === entry.file && trace.line === entry.sinkLine));
    if (item) matched.add(item.file);
    else unmatched.push(finding.fingerprint);
  }
  const sourceLeadCases = oracle.cases.filter((entry) => entry.vulnerable && findings.some((f) => f.verdict === 'needs_validation' && f.trace.some((trace) => trace.kind === 'sink' && trace.file === entry.file && trace.line === entry.sinkLine))).length;
  const results = oracle.cases.map((entry) => ({ ...entry, result: entry.vulnerable ? (matched.has(entry.file) ? 'hit' : 'miss') : (confirmed.some((f) => f.trace.some((trace) => trace.file === entry.file)) ? 'flagged-control' : 'clean-control') }));
  return { runId: oracle.runId, findingsSha256: hash(readFileSync(findingsFile, 'utf8')), expectedPositiveCases: 2, expectedNegativeCases: 4, hitCases: matched.size, sourceLeadCases, missedCases: 2 - matched.size, flaggedControls: results.filter((r) => r.result === 'flagged-control').length, unmatchedConfirmedFindings: unmatched, needsValidation: findings.filter((f) => f.verdict === 'needs_validation').length, results,
    limitation: 'Location matching is only a benchmark signal. It does not establish root cause, independent model discovery, source isolation, or exploit validity. Review raw discovery and independent verification transcripts before claiming automatic discovery.' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [, , action, directory, input] = process.argv;
    if (!directory || !['prepare', 'grade'].includes(action) || (action === 'grade' && !input)) throw new Error('Usage: node benchmark.mjs prepare <new-run-dir> | grade <run-dir> <findings.json>');
    console.log(JSON.stringify(action === 'prepare' ? prepare(directory) : grade(directory, input), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
