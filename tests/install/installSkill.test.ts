import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installSkill } from '../../src/install/installSkill.js';
import { loadRegistry } from '../../src/install/registry.js';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tempRoots.length = 0;
  vi.restoreAllMocks();
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'skill-doctor-install-'));
  tempRoots.push(dir);
  return dir;
}

describe('installSkill', () => {
  it('copies local skill-dirs source to target platform', async () => {
    const base = makeTempDir();
    const sourceDir = join(base, 'my-skill');
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, 'SKILL.md'), '---\nname: my-skill\ndescription: test\n---\n# My Skill');

    const globalDir = join(base, 'target', '.claude', 'skills');
    mkdirSync(globalDir, { recursive: true });

    const registryPath = join(base, 'registry.json');

    await installSkill({
      source: join(sourceDir, 'SKILL.md'),
      platform: 'claude',
      globalDir,
      layout: 'skill-dirs',
      registryPath,
      link: false,
    });

    const installedContent = readFileSync(
      join(globalDir, 'my-skill', 'SKILL.md'),
      'utf8',
    );
    expect(installedContent).toContain('name: my-skill');

    const registry = loadRegistry(registryPath);
    expect(registry.entries).toHaveLength(1);
    expect(registry.entries[0].name).toBe('my-skill');
    expect(registry.entries[0].platform).toBe('claude');
    expect(registry.entries[0].source).toBe('local');
  });

  it('copies skill to files layout as a .md file', async () => {
    const base = makeTempDir();
    const sourceFile = join(base, 'cursor-skill.md');
    writeFileSync(sourceFile, '---\nname: cursor-skill\ndescription: cursor test\n---\n# Cursor Skill');

    const globalDir = join(base, 'target', '.cursor', 'rules');
    mkdirSync(globalDir, { recursive: true });

    const registryPath = join(base, 'registry.json');

    await installSkill({
      source: sourceFile,
      platform: 'cursor',
      globalDir,
      layout: 'files',
      registryPath,
      link: false,
    });

    const installed = readFileSync(join(globalDir, 'cursor-skill.md'), 'utf8');
    expect(installed).toContain('name: cursor-skill');
  });

  it('errors if skill already installed at target path', async () => {
    const base = makeTempDir();
    const sourceDir = join(base, 'my-skill');
    mkdirSync(join(sourceDir), { recursive: true });
    writeFileSync(join(sourceDir, 'SKILL.md'), '---\nname: my-skill\ndescription: test\n---\n# My Skill');

    const globalDir = join(base, '.claude', 'skills');
    mkdirSync(join(globalDir, 'my-skill'), { recursive: true });
    writeFileSync(join(globalDir, 'my-skill', 'SKILL.md'), 'existing');

    const registryPath = join(base, 'registry.json');

    await expect(
      installSkill({
        source: join(sourceDir, 'SKILL.md'),
        platform: 'claude',
        globalDir,
        layout: 'skill-dirs',
        registryPath,
        link: false,
      }),
    ).rejects.toThrow('already exists');
  });
});
