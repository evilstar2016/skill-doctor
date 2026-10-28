import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepare, grade } from './benchmark.mjs';

function scenario(run) {
  const temporary = mkdtempSync(join(tmpdir(), 'audit-benchmark-test-'));
  const directory = join(temporary, 'run');
  try { const metadata = prepare(directory); run(directory, metadata); } finally { rmSync(temporary, { recursive: true, force: true }); }
}
test('blind source names carry no answer and empty reports score zero hits', () => scenario((directory, metadata) => {
  const oracle = JSON.parse(readFileSync(join(directory, 'oracle.json')));
  assert.equal(oracle.cases.length, 6);
  assert.equal(oracle.cases.filter((c) => c.vulnerable).length, 2);
  assert(oracle.cases.every((c) => /^module-[a-f0-9-]+\.mjs$/.test(c.file)));
  const findings = join(directory, 'empty.json'); writeFileSync(findings, '[]');
  assert.equal(grade(directory, findings).hitCases, 0);
  assert.equal(grade(directory, findings).missedCases, 2);
  assert.equal(grade(directory, findings).flaggedControls, 0);
  assert(!readFileSync(join(metadata.target, 'CONTEXT.md'), 'utf8').includes('vulnerable'));
  assert.throws(() => prepare(directory), /new, empty/);
}));
test('modified source invalidates the run', () => scenario((directory, metadata) => {
  const oracle = JSON.parse(readFileSync(join(directory, 'oracle.json')));
  writeFileSync(join(metadata.target, oracle.cases[0].file), 'changed');
  const findings = join(directory, 'empty.json'); writeFileSync(findings, '[]');
  assert.throws(() => grade(directory, findings), /Target changed/);
}));
test('changed contracts invalidate the run', () => scenario((directory, metadata) => {
  writeFileSync(join(metadata.target, 'CONTEXT.md'), 'changed');
  const findings = join(directory, 'empty.json'); writeFileSync(findings, '[]');
  assert.throws(() => grade(directory, findings), /contract changed/);
}));
test('unstructured model claims cannot enter scoring', () => scenario((directory) => {
  const findings = join(directory, 'bad.json'); writeFileSync(findings, '[{"verdict":"confirmed"}]');
  assert.throws(() => grade(directory, findings), /Invalid upstream findings/);
}));
// These records test scoring arithmetic only; they are not model audit results.
function syntheticConfirmed(file, line, fingerprint) {
  return { verdict: 'confirmed', fingerprint, title: 'Unit fixture', description: 'Synthetic grader fixture', root_cause: 'Fixture only', intended_behavior: 'Fixture contract', trace: [{ kind: 'sink', file, line, scope: 'fixture', description: 'Synthetic location' }], evidence: [{ file, line, description: 'Unit-test data only' }], conditions: [], execution: { attacker_perspective: 'Dummy caller', payloads: ['dummy'], instructions: ['Synthetic record, not an executed audit'], observed_result: 'Fixture value only' }, remediation: { strategy: 'Fixture change' }, severity: { likelihood: { score: 'low', reason: 'Fixture' }, impact: { score: 'low', reason: 'Fixture' }, overall_severity: 'low' }, confidence: { score: 'low', reason: 'Synthetic fixture' } };
}
test('scores positive matches and flagged controls separately without crediting duplicate claims', () => scenario((directory) => {
  const oracle = JSON.parse(readFileSync(join(directory, 'oracle.json')));
  const positives = oracle.cases.filter((c) => c.vulnerable);
  const control = oracle.cases.find((c) => !c.vulnerable);
  const records = [syntheticConfirmed(positives[0].file, positives[0].sinkLine, 'a'), syntheticConfirmed(positives[0].file, positives[0].sinkLine, 'b'), syntheticConfirmed(positives[1].file, positives[1].sinkLine, 'c'), syntheticConfirmed(control.file, 2, 'd')];
  const findings = join(directory, 'synthetic-unit-fixtures.json'); writeFileSync(findings, JSON.stringify(records));
  const result = grade(directory, findings);
  assert.equal(result.hitCases, 2);
  assert.equal(result.missedCases, 0);
  assert.equal(result.flaggedControls, 1);
  assert.deepEqual(result.unmatchedConfirmedFindings, ['d']);
}));
