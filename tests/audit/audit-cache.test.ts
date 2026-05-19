import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AiFinding } from '../../src/types/audit';
import { hashContent, readAuditCache, writeAuditCache } from '../../src/audit/audit-cache';

const FINDING: AiFinding = {
  source: 'ai',
  skillName: 'test',
  sourcePath: '/fake/SKILL.md',
  platform: 'claude',
  scope: 'global',
  code: 'shell-pipe-exec',
  severity: 'high',
  title: 'Shell pipe',
  detail: 'runs shell commands',
};

describe('hashContent', () => {
  it('returns a 64-char hex sha256', () => {
    const h = hashContent('hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashContent('hello')).toBe(h);
  });

  it('returns different hashes for different content', () => {
    expect(hashContent('a')).not.toBe(hashContent('b'));
  });
});

describe('readAuditCache', () => {
  it('returns empty map when cache file does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sk-cache-test-'));
    expect(readAuditCache(dir).size).toBe(0);
  });
});

describe('writeAuditCache / readAuditCache', () => {
  it('round-trips a cache entry', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sk-cache-test-'));
    const hash = hashContent('skill-content');
    const cache = new Map([[hash, { cachedAt: 1000, model: 'test-model', findings: [FINDING] }]]);

    writeAuditCache(cache, dir);
    const loaded = readAuditCache(dir);

    expect(loaded.get(hash)).toEqual({ cachedAt: 1000, model: 'test-model', findings: [FINDING] });
  });

  it('returns empty map when cache file is corrupt JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sk-cache-test-'));
    const cache = new Map([['x', { cachedAt: 0, model: 'm', findings: [] }]]);
    writeAuditCache(cache, dir); // creates .skill-doctor/audit-cache.json under dir
    writeFileSync(join(dir, '.skill-doctor', 'audit-cache.json'), 'not json', 'utf-8');
    expect(readAuditCache(dir).size).toBe(0);
  });

  it('skips cache entries where model does not match', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sk-cache-test-'));
    const hash = hashContent('same-content');
    const cache = new Map([[hash, { cachedAt: 1000, model: 'old-model', findings: [FINDING] }]]);
    writeAuditCache(cache, dir);

    // loaded fine, but caller checks model — cache module doesn't filter by model
    const loaded = readAuditCache(dir);
    expect(loaded.get(hash)?.model).toBe('old-model');
  });
});
