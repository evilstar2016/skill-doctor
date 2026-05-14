import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  loadProvenanceCache,
  saveProvenanceCache,
} from '../../src/parsing/provenanceCache';

let tmpDir: string;
let cachePath: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `skill-doctor-provenance-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  cachePath = join(tmpDir, 'provenance.json');
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
});

describe('loadProvenanceCache', () => {
  it('returns empty map when file does not exist', () => {
    expect(loadProvenanceCache(cachePath).size).toBe(0);
  });

  it('loads existing repository and author values', () => {
    writeFileSync(
      cachePath,
      JSON.stringify({
        '/skills/git/SKILL.md': {
          repository: 'https://github.com/example/git-skill.git',
          author: 'Example Author',
        },
      }),
    );

    expect(loadProvenanceCache(cachePath).get('/skills/git/SKILL.md')).toEqual({
      repository: 'https://github.com/example/git-skill.git',
      author: 'Example Author',
      resolved: true,
    });
  });
});

describe('saveProvenanceCache', () => {
  it('writes UTF-8 with BOM and round-trips Chinese author names', () => {
    const cache = new Map([
      ['/skills/中文/SKILL.md', { repository: 'https://github.com/example/zh.git', author: '中文作者' }],
    ]);

    saveProvenanceCache(cache, cachePath);

    const raw = readFileSync(cachePath, 'utf8');
    expect(raw.charCodeAt(0)).toBe(0xfeff);
    expect(loadProvenanceCache(cachePath).get('/skills/中文/SKILL.md')).toEqual({
      repository: 'https://github.com/example/zh.git',
      author: '中文作者',
      resolved: true,
    });
  });

  it('persists resolved misses so partial cache entries do not retry forever', () => {
    const cache = new Map([
      ['/skills/missing/SKILL.md', { resolved: true }],
    ]);

    saveProvenanceCache(cache, cachePath);

    expect(loadProvenanceCache(cachePath).get('/skills/missing/SKILL.md')).toEqual({ resolved: true });
  });
});
