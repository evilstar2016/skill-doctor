import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import {
  loadRegistry,
  saveRegistry,
  addRegistryEntry,
  removeRegistryEntry,
  findRegistryEntry,
} from '../../src/install/registry.js';
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

describe('addRegistryEntry', () => {
  it('adds a new entry', () => {
    const dir = makeTempDir();
    const path = join(dir, 'registry.json');
    const entry = makeEntry();
    addRegistryEntry(path, entry);
    const registry = loadRegistry(path);
    expect(registry.entries).toHaveLength(1);
    expect(registry.entries[0].name).toBe('test-skill');
  });

  it('replaces existing entry with same name+platform', () => {
    const dir = makeTempDir();
    const path = join(dir, 'registry.json');
    addRegistryEntry(path, makeEntry({ contentHash: 'sha256:old' }));
    addRegistryEntry(path, makeEntry({ contentHash: 'sha256:new' }));
    const registry = loadRegistry(path);
    expect(registry.entries).toHaveLength(1);
    expect(registry.entries[0].contentHash).toBe('sha256:new');
  });
});

describe('removeRegistryEntry', () => {
  it('removes entry by name and platform', () => {
    const dir = makeTempDir();
    const path = join(dir, 'registry.json');
    addRegistryEntry(path, makeEntry());
    removeRegistryEntry(path, 'test-skill', 'claude');
    const registry = loadRegistry(path);
    expect(registry.entries).toHaveLength(0);
  });

  it('does nothing if entry not found', () => {
    const dir = makeTempDir();
    const path = join(dir, 'registry.json');
    removeRegistryEntry(path, 'nonexistent', 'claude');
    expect(loadRegistry(path).entries).toHaveLength(0);
  });
});

describe('findRegistryEntry', () => {
  it('finds entry by name and platform', () => {
    const dir = makeTempDir();
    const path = join(dir, 'registry.json');
    addRegistryEntry(path, makeEntry());
    const found = findRegistryEntry(path, 'test-skill', 'claude');
    expect(found?.name).toBe('test-skill');
  });

  it('returns undefined for missing entry', () => {
    const dir = makeTempDir();
    const path = join(dir, 'registry.json');
    const found = findRegistryEntry(path, 'missing', 'claude');
    expect(found).toBeUndefined();
  });
});
