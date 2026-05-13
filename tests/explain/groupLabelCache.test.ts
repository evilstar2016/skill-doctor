import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clusterKey,
  loadGroupLabelCache,
  saveGroupLabelCache,
} from '../../src/explain/groupLabelCache';
import type { SkillRecord } from '../../src/types/skill';

function makeSkill(name: string): SkillRecord {
  return { name, sourcePath: `/skills/${name}/SKILL.md`, platform: 'claude', scope: 'project', description: '', triggers: [] };
}

let tmpDir: string;
let cachePath: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `skill-doctor-cache-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  cachePath = join(tmpDir, 'group-labels.json');
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
});

describe('clusterKey', () => {
  it('produces the same key regardless of skill order', () => {
    const a = makeSkill('git-workflow');
    const b = makeSkill('github-automation');
    expect(clusterKey([a, b])).toBe(clusterKey([b, a]));
  });

  it('produces different keys for different clusters', () => {
    const a = makeSkill('git-workflow');
    const b = makeSkill('github-automation');
    const c = makeSkill('cooking-tips');
    expect(clusterKey([a, b])).not.toBe(clusterKey([a, c]));
  });
});

describe('loadGroupLabelCache', () => {
  it('returns empty map when file does not exist', () => {
    const cache = loadGroupLabelCache(cachePath);
    expect(cache.size).toBe(0);
  });

  it('returns empty map when file contains invalid JSON', () => {
    writeFileSync(cachePath, 'not-json');
    const cache = loadGroupLabelCache(cachePath);
    expect(cache.size).toBe(0);
  });

  it('loads existing entries', () => {
    writeFileSync(cachePath, JSON.stringify({ 'path-a|path-b': 'Version Control' }));
    const cache = loadGroupLabelCache(cachePath);
    expect(cache.get('path-a|path-b')).toBe('Version Control');
  });

  it('ignores non-string values', () => {
    writeFileSync(cachePath, JSON.stringify({ 'key1': 'Valid', 'key2': 42 }));
    const cache = loadGroupLabelCache(cachePath);
    expect(cache.has('key1')).toBe(true);
    expect(cache.has('key2')).toBe(false);
  });
});

describe('saveGroupLabelCache', () => {
  it('writes cache to file', () => {
    const cache = new Map([['path-a|path-b', 'Version Control']]);
    saveGroupLabelCache(cache, cachePath);
    expect(existsSync(cachePath)).toBe(true);
    const loaded = loadGroupLabelCache(cachePath);
    expect(loaded.get('path-a|path-b')).toBe('Version Control');
  });

  it('creates parent directory if missing', () => {
    const deepPath = join(tmpDir, 'nested', 'dir', 'cache.json');
    const cache = new Map([['k', 'v']]);
    saveGroupLabelCache(cache, deepPath);
    expect(existsSync(deepPath)).toBe(true);
  });

  it('round-trips multiple entries', () => {
    const cache = new Map([
      ['key-1', 'Label One'],
      ['key-2', 'Label Two'],
    ]);
    saveGroupLabelCache(cache, cachePath);
    const loaded = loadGroupLabelCache(cachePath);
    expect(loaded.get('key-1')).toBe('Label One');
    expect(loaded.get('key-2')).toBe('Label Two');
  });
});
