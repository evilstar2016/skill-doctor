import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { importSecurityReport, loadSecurityState, prepareSecurityTask, setSecurityEnabled, upstreamInfo, validateSecurityReport } from '../../src/security-component/component';

const homes: string[] = [];
function home() { const value = mkdtempSync(join(tmpdir(), 'security-component-')); homes.push(value); return value; }
const target = '/example/project';
const base = () => ({ schemaVersion: 1, mode: 'design', upstreamCommit: upstreamInfo().commit, target, revision: 'abc123', scope: 'design.md', design: { trustBoundaries: ['user to tool'], threats: ['untrusted input'], assumptions: [], requirements: [{ id: 'AUTH-1', description: 'Authorize each tool action' }] } });
afterEach(() => { for (const directory of homes.splice(0)) rmSync(directory, { recursive: true, force: true }); });
describe('optional security component', () => {
  it('is disabled by default and isolated per project', () => {
    const directory = home();
    expect(loadSecurityState(target, directory)).toEqual({ enabled: false, reports: [] });
    expect(() => importSecurityReport(target, base(), directory)).toThrow('Enable');
    expect(() => prepareSecurityTask(target, 'design', 'docs', 'abc', undefined, directory)).toThrow('Enable');
    setSecurityEnabled(target, true, directory);
    expect(loadSecurityState('/other', directory).enabled).toBe(false);
  });
  it('imports once, preserves reports when disabled and generates a pinned task', () => {
    const directory = home(); setSecurityEnabled(target, true, directory);
    importSecurityReport(target, base(), directory);
    expect(importSecurityReport(target, base(), directory).reports).toHaveLength(1);
    const task = prepareSecurityTask(target, 'code', 'src', 'abc123', loadSecurityState(target, directory).reports[0].id, directory);
    expect(task).toContain(upstreamInfo().commit); expect(task).toContain('AUTH-1');
    expect(setSecurityEnabled(target, false, directory).reports).toHaveLength(1);
  });
  it('rejects incompatible versions, targets, malformed design and invalid findings', () => {
    expect(() => validateSecurityReport({ ...base(), upstreamCommit: 'main' }, target)).toThrow('version');
    expect(() => validateSecurityReport({ ...base(), target: '/other' }, target)).toThrow('target');
    expect(() => validateSecurityReport({ ...base(), design: { ...base().design, requirements: [base().design.requirements[0], base().design.requirements[0]] } }, target)).toThrow('unique');
    expect(() => validateSecurityReport({ ...base(), mode: 'code', design: undefined, findings: [{ verdict: 'confirmed' }] }, target)).toThrow('Invalid findings');
  });
  it('preserves all upstream verdicts and rejects severity on unresolved findings', () => {
    const trace = [{ kind: 'sink', file: 'src/tool.ts', line: 1, scope: 'handler', description: 'Tool dispatch' }];
    const evidence = [{ file: 'src/tool.ts', line: 1, description: 'Source evidence' }];
    const common = { title: 'Tool risk', description: 'Boundary analysis', trace, evidence };
    const confirmed = { ...common, verdict: 'confirmed', fingerprint: 'a', root_cause: 'Missing authorization', intended_behavior: 'Authorize resource access', conditions: [], execution: { attacker_perspective: 'Unprivileged user', payloads: ['resource=other'], instructions: ['Call the local tool'], observed_result: 'Other resource returned in isolated fixture' }, remediation: { strategy: 'Check the requester permission' }, severity: { likelihood: { score: 'high', reason: 'Reachable tool' }, impact: { score: 'high', reason: 'Private resource disclosed' }, overall_severity: 'high' }, confidence: { score: 'high', reason: 'Bounded reproduction observed' } };
    const unresolved = { ...common, verdict: 'needs_validation', fingerprint: 'b', claimed_root_cause: 'Potential permission gap', blockers: ['Deployment identity unavailable'], validation_plan: { deployment: 'Check requester scope in owner environment' } };
    const rejected = { ...common, verdict: 'rejected', fingerprint: 'c', claimed_root_cause: 'Suspected permission gap', reason: 'Dispatcher enforces requester scope' };
    const code = { ...base(), mode: 'code', design: undefined, findings: [confirmed, unresolved, rejected] };
    expect(validateSecurityReport(JSON.parse(JSON.stringify(code)), target).findings).toHaveLength(3);
    expect(() => validateSecurityReport({ ...code, findings: [{ ...unresolved, severity: 'high' }] }, target)).toThrow('Invalid findings');
  });
  it('requires full design coverage and evidence, and confirmed findings for issue checks', () => {
    const directory = home(); setSecurityEnabled(target, true, directory);
    const state = importSecurityReport(target, base(), directory);
    const code = { ...base(), mode: 'code', design: undefined, findings: [], designReportId: state.reports[0].id, checks: [] as unknown[] };
    expect(() => validateSecurityReport(code, target, state.reports)).toThrow('every');
    code.checks = [{ requirementId: 'AUTH-1', status: 'issue', evidence: 'See source', findingFingerprint: 'missing' }];
    expect(() => validateSecurityReport(code, target, state.reports)).toThrow('confirmed');
    code.checks = [{ requirementId: 'AUTH-1', status: 'insufficient-evidence', evidence: 'Runtime permissions unavailable' }];
    expect(importSecurityReport(target, code, directory).reports).toHaveLength(2);
  });
});
