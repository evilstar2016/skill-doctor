import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import { uninstallSkill } from '../../src/install/uninstallSkill.js';
import { addRegistryEntry, loadRegistry } from '../../src/install/registry.js';
import { hashSkillDirectory } from '../../src/library/skillDirectory.js';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tempRoots.length = 0;
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'skill-doctor-uninstall-'));
  tempRoots.push(dir);
  return dir;
}

describe('uninstallSkill', () => {
  it('removes installed skill file and registry entry', async () => {
    const base = makeTempDir();
    const skillDir = join(base, '.claude', 'skills', 'my-skill');
    mkdirSync(skillDir, { recursive: true });
    const skillPath = join(skillDir, 'SKILL.md');
    writeFileSync(skillPath, '---\nname: my-skill\ndescription: test\n---\n');

    const registryPath = join(base, 'registry.json');
    const { createHash } = await import('node:crypto');
    const { readFileSync } = await import('node:fs');
    const hash = `sha256:${createHash('sha256').update(readFileSync(skillPath)).digest('hex')}`;

    addRegistryEntry(registryPath, {
      name: 'my-skill',
      platform: 'claude',
      scope: 'global',
      installedPath: skillPath,
      installedAt: new Date().toISOString(),
      contentHash: hash,
      source: 'local',
      sourceRef: '/original/path',
    });

    await uninstallSkill({ name: 'my-skill', platform: 'claude', registryPath, force: false });

    expect(existsSync(skillPath)).toBe(false);
    expect(loadRegistry(registryPath).entries).toHaveLength(0);
  });

  it('errors if skill not in registry', async () => {
    const base = makeTempDir();
    const registryPath = join(base, 'registry.json');

    await expect(
      uninstallSkill({ name: 'missing', platform: 'claude', registryPath, force: false }),
    ).rejects.toThrow("Skill 'missing' is not in the registry");
  });

  it('removes the complete installed skill directory recorded by new installs', async () => {
    const base = makeTempDir();
    const skillDir = join(base, '.claude', 'skills', 'my-skill');
    mkdirSync(join(skillDir, 'assets'), { recursive: true });
    const skillPath = join(skillDir, 'SKILL.md');
    writeFileSync(skillPath, 'skill content');
    writeFileSync(join(skillDir, 'assets', 'prompt.txt'), 'asset');
    const hash = hashSkillDirectory(skillDir);
    const registryPath = join(base, 'registry.json');
    addRegistryEntry(registryPath, {
      name: 'my-skill', platform: 'claude', scope: 'global', installedPath: skillPath,
      installedRootPath: skillDir, installedAt: new Date().toISOString(), contentHash: hash,
      source: 'local', sourceRef: '/original/path',
    });

    await uninstallSkill({ name: 'my-skill', platform: 'claude', registryPath, force: false });

    expect(existsSync(skillDir)).toBe(false);
  });

  it('errors if file was externally modified and force is false', async () => {
    const base = makeTempDir();
    const skillDir = join(base, '.claude', 'skills', 'my-skill');
    mkdirSync(skillDir, { recursive: true });
    const skillPath = join(skillDir, 'SKILL.md');
    writeFileSync(skillPath, 'original content');

    const registryPath = join(base, 'registry.json');
    addRegistryEntry(registryPath, {
      name: 'my-skill',
      platform: 'claude',
      scope: 'global',
      installedPath: skillPath,
      installedAt: new Date().toISOString(),
      contentHash: 'sha256:differenthash',
      source: 'local',
      sourceRef: '/original',
    });

    await expect(
      uninstallSkill({ name: 'my-skill', platform: 'claude', registryPath, force: false }),
    ).rejects.toThrow('externally modified');
  });

  it('removes modified file when force is true', async () => {
    const base = makeTempDir();
    const skillDir = join(base, '.claude', 'skills', 'my-skill');
    mkdirSync(skillDir, { recursive: true });
    const skillPath = join(skillDir, 'SKILL.md');
    writeFileSync(skillPath, 'modified content');

    const registryPath = join(base, 'registry.json');
    addRegistryEntry(registryPath, {
      name: 'my-skill',
      platform: 'claude',
      scope: 'global',
      installedPath: skillPath,
      installedAt: new Date().toISOString(),
      contentHash: 'sha256:differenthash',
      source: 'local',
      sourceRef: '/original',
    });

    await uninstallSkill({ name: 'my-skill', platform: 'claude', registryPath, force: true });

    expect(existsSync(skillPath)).toBe(false);
  });
});
