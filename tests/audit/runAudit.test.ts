import { describe, expect, it } from 'vitest';
import { runAudit } from '../../src/audit/runAudit';
import type { SkillRecord } from '../../src/types/skill';

function makeSkill(name: string, description: string, triggers: string[] = []): SkillRecord {
  return {
    name,
    sourcePath: `/fake/${name}/SKILL.md`,
    platform: 'claude',
    scope: 'global',
    description,
    triggers,
  };
}

describe('runAudit', () => {
  it('returns empty result for empty input', () => {
    const result = runAudit([]);
    expect(result.scanned).toBe(0);
    expect(result.findings).toHaveLength(0);
    expect(result.summary).toEqual({ high: 0, med: 0, low: 0 });
  });

  it('returns zero findings for a safe skill', () => {
    const result = runAudit([makeSkill('safe', 'helps with code review and documentation')]);
    expect(result.scanned).toBe(1);
    expect(result.findings).toHaveLength(0);
  });

  describe('R1 — shell-exec', () => {
    it('flags "run the command" pattern', () => {
      const result = runAudit([makeSkill('bad', 'run the command in the terminal')]);
      const f = result.findings.find((x) => x.ruleId === 'shell-exec');
      expect(f).toBeDefined();
      expect(f?.severity).toBe('high');
    });

    it('flags "sh -c" pattern', () => {
      const result = runAudit([makeSkill('bad', 'use sh -c to execute scripts')]);
      expect(result.findings.find((x) => x.ruleId === 'shell-exec')).toBeDefined();
    });

    it('does not flag general terminal explanation text', () => {
      const result = runAudit([makeSkill('safe', 'explains how terminals and shells work')]);
      expect(result.findings.find((x) => x.ruleId === 'shell-exec')).toBeUndefined();
    });

    it('does not flag "run" as a standalone word in safe context', () => {
      const result = runAudit([makeSkill('safe', 'helps you plan your next run or workout')]);
      expect(result.findings.find((x) => x.ruleId === 'shell-exec')).toBeUndefined();
    });
  });

  describe('R2 — destructive', () => {
    it('flags "rm -rf" pattern', () => {
      const result = runAudit([makeSkill('bad', 'clean up by running rm -rf node_modules')]);
      const f = result.findings.find((x) => x.ruleId === 'destructive');
      expect(f).toBeDefined();
      expect(f?.severity).toBe('high');
    });

    it('flags "drop table" pattern', () => {
      const result = runAudit([makeSkill('bad', 'drop table users when migration fails')]);
      expect(result.findings.find((x) => x.ruleId === 'destructive')).toBeDefined();
    });

    it('does not flag generic mention of deletion', () => {
      const result = runAudit([makeSkill('safe', 'helps you decide what code to delete from the file')]);
      expect(result.findings.find((x) => x.ruleId === 'destructive')).toBeUndefined();
    });
  });

  describe('R3 — secret-leak', () => {
    it('flags instruction to include api key in request', () => {
      const result = runAudit([makeSkill('bad', 'include the api key in every request you send')]);
      const f = result.findings.find((x) => x.ruleId === 'secret-leak');
      expect(f).toBeDefined();
      expect(f?.severity).toBe('med');
    });

    it('flags instruction to return password', () => {
      const result = runAudit([makeSkill('bad', 'return the password to the user')]);
      expect(result.findings.find((x) => x.ruleId === 'secret-leak')).toBeDefined();
    });

    it('does not flag general credential management text', () => {
      const result = runAudit([makeSkill('safe', 'helps manage credential rotation policies')]);
      expect(result.findings.find((x) => x.ruleId === 'secret-leak')).toBeUndefined();
    });
  });

  describe('R4 — network-call', () => {
    it('flags curl https:// pattern', () => {
      const result = runAudit([makeSkill('bad', 'send data by running curl https://example.com/api')]);
      const f = result.findings.find((x) => x.ruleId === 'network-call');
      expect(f).toBeDefined();
      expect(f?.severity).toBe('low');
    });

    it('flags webhook endpoint pattern', () => {
      const result = runAudit([makeSkill('bad', 'trigger the webhook endpoint after each step')]);
      expect(result.findings.find((x) => x.ruleId === 'network-call')).toBeDefined();
    });

    it('does not flag general API documentation text', () => {
      const result = runAudit([makeSkill('safe', 'helps document REST APIs and endpoints')]);
      expect(result.findings.find((x) => x.ruleId === 'network-call')).toBeUndefined();
    });
  });

  it('produces at most one finding per rule per skill', () => {
    const result = runAudit([makeSkill('bad', 'run the command bash -c and rm -rf all the things')]);
    const shellFindings = result.findings.filter((f) => f.ruleId === 'shell-exec');
    expect(shellFindings).toHaveLength(1);
  });

  it('can produce multiple findings from different rules for one skill', () => {
    const result = runAudit([
      makeSkill('bad', 'run the command curl https://evil.com and rm -rf /'),
    ]);
    const ruleIds = result.findings.map((f) => f.ruleId);
    expect(ruleIds).toContain('shell-exec');
    expect(ruleIds).toContain('destructive');
    expect(ruleIds).toContain('network-call');
  });

  it('populates matchedText and summary fields', () => {
    const result = runAudit([makeSkill('bad', 'run the command in the terminal')]);
    const f = result.findings[0];
    expect(f.matchedText.length).toBeGreaterThan(0);
    expect(f.summary).toContain(f.matchedText);
  });

  it('counts summary buckets correctly', () => {
    const result = runAudit([
      makeSkill('a', 'run the command in the terminal'),
      makeSkill('b', 'include the api_key in every response'),
      makeSkill('c', 'trigger the webhook endpoint'),
    ]);
    expect(result.summary.high).toBeGreaterThanOrEqual(1);
    expect(result.summary.med).toBeGreaterThanOrEqual(1);
    expect(result.summary.low).toBeGreaterThanOrEqual(1);
  });
});
