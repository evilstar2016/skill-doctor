import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  loadWhenToUseCache,
  saveWhenToUseCache,
} from '../../src/explain/whenToUseCache';

let tmpDir: string;
let cachePath: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `skill-doctor-wtu-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  cachePath = join(tmpDir, 'when-to-use.json');
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
});

describe('loadWhenToUseCache', () => {
  it('returns empty map when file does not exist', () => {
    const cache = loadWhenToUseCache(cachePath);
    expect(cache.size).toBe(0);
  });

  it('returns empty map when file contains invalid JSON', () => {
    writeFileSync(cachePath, 'not-json');
    const cache = loadWhenToUseCache(cachePath);
    expect(cache.size).toBe(0);
  });

  it('loads existing entries keyed by sourcePath', () => {
    writeFileSync(cachePath, JSON.stringify({ '/skills/git/SKILL.md': 'Use when managing git.' }));
    const cache = loadWhenToUseCache(cachePath);
    expect(cache.get('/skills/git/SKILL.md')).toBe('Use when managing git.');
  });

  it('ignores non-string values', () => {
    writeFileSync(cachePath, JSON.stringify({ '/skills/a/SKILL.md': 'Valid', '/skills/b/SKILL.md': 42 }));
    const cache = loadWhenToUseCache(cachePath);
    expect(cache.has('/skills/a/SKILL.md')).toBe(true);
    expect(cache.has('/skills/b/SKILL.md')).toBe(false);
  });
});

describe('saveWhenToUseCache', () => {
  it('writes cache to file and round-trips', () => {
    const cache = new Map([['/skills/git/SKILL.md', 'Use when managing git.']]);
    saveWhenToUseCache(cache, cachePath);
    expect(existsSync(cachePath)).toBe(true);
    const loaded = loadWhenToUseCache(cachePath);
    expect(loaded.get('/skills/git/SKILL.md')).toBe('Use when managing git.');
  });

  it('creates parent directory if missing', () => {
    const deepPath = join(tmpDir, 'nested', 'dir', 'when-to-use.json');
    saveWhenToUseCache(new Map([['k', 'v']]), deepPath);
    expect(existsSync(deepPath)).toBe(true);
  });

  it('round-trips multiple entries', () => {
    const cache = new Map([
      ['/skills/a/SKILL.md', 'Explanation A'],
      ['/skills/b/SKILL.md', 'Explanation B'],
    ]);
    saveWhenToUseCache(cache, cachePath);
    const loaded = loadWhenToUseCache(cachePath);
    expect(loaded.get('/skills/a/SKILL.md')).toBe('Explanation A');
    expect(loaded.get('/skills/b/SKILL.md')).toBe('Explanation B');
  });
});
