import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import { loadRegistry, saveRegistry } from '../../src/install/registry.js';
import type { RegistryEntry } from '../../src/types/install.js';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tempRoots.length = 0;
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'skill-doctor-registry-'));
  tempRoots.push(dir);
  return dir;
}

function makeEntry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    name: 'test-skill',
    platform: 'claude',
    scope: 'global',
    installedPath: '/home/user/.claude/skills/test-skill/SKILL.md',
    installedAt: '2026-05-18T10:00:00Z',
    contentHash: 'sha256:abc123',
    source: 'local',
    sourceRef: '/path/to/test-skill',
    ...overrides,
  };
}

describe('loadRegistry', () => {
  it('returns empty registry when file does not exist', () => {
    const dir = makeTempDir();
    const result = loadRegistry(join(dir, 'registry.json'));
    expect(result).toEqual({ version: 1, entries: [] });
  });

  it('reads existing registry file', () => {
    const dir = makeTempDir();
    const path = join(dir, 'registry.json');
    const entry = makeEntry();
    saveRegistry(path, { version: 1, entries: [entry] });
    const result = loadRegistry(path);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].name).toBe('test-skill');
  });
});
