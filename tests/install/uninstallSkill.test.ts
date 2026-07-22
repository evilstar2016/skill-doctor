import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import { uninstallSkill } from '../../src/install/uninstallSkill.js';
import { upsertRegistryInstall, loadCenterRegistry } from '../../src/library/centerStore.js';
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

function seed(homeDir: string, entry: {
  name: string;
  platform: 'claude';
  scope?: 'global' | 'project';
  installedPath: string;
  installedRootPath?: string;
  contentHash: string;
}): void {
  upsertRegistryInstall(homeDir, {
    name: entry.name,
    platform: entry.platform,
    scope: entry.scope ?? 'global',
    installedPath: entry.installedPath,
    ...(entry.installedRootPath ? { installedRootPath: entry.installedRootPath } : {}),
    installedAt: new Date().toISOString(),
    contentHash: entry.contentHash,
    source: 'local',
    sourceRef: '/original/path',
    mode: 'copy',
  });
}

describe('uninstallSkill', () => {
  it('removes installed skill file and registry entry', async () => {
    const base = makeTempDir();
    const skillDir = join(base, '.claude', 'skills', 'my-skill');
    mkdirSync(skillDir, { recursive: true });
    const skillPath = join(skillDir, 'SKILL.md');
    writeFileSync(skillPath, '---\nname: my-skill\ndescription: test\n---\n');

    const { createHash } = await import('node:crypto');
    const { readFileSync } = await import('node:fs');
    const hash = `sha256:${createHash('sha256').update(readFileSync(skillPath)).digest('hex')}`;

    seed(base, { name: 'my-skill', platform: 'claude', installedPath: skillPath, contentHash: hash });

    await uninstallSkill({ name: 'my-skill', platform: 'claude', homeDir: base, force: false });

    expect(existsSync(skillPath)).toBe(false);
    expect(loadCenterRegistry(base).entries).toHaveLength(0);
  });

  it('errors if skill not in registry', async () => {
    const base = makeTempDir();

    await expect(
      uninstallSkill({ name: 'missing', platform: 'claude', homeDir: base, force: false }),
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
    seed(base, { name: 'my-skill', platform: 'claude', installedPath: skillPath, installedRootPath: skillDir, contentHash: hash });

    await uninstallSkill({ name: 'my-skill', platform: 'claude', homeDir: base, force: false });

    expect(existsSync(skillDir)).toBe(false);
  });

  it('errors if file was externally modified and force is false', async () => {
    const base = makeTempDir();
    const skillDir = join(base, '.claude', 'skills', 'my-skill');
    mkdirSync(skillDir, { recursive: true });
    const skillPath = join(skillDir, 'SKILL.md');
    writeFileSync(skillPath, 'original content');

    seed(base, {
      name: 'my-skill',
      platform: 'claude',
      installedPath: skillPath,
      contentHash: 'sha256:differenthash',
    });

    await expect(
      uninstallSkill({ name: 'my-skill', platform: 'claude', homeDir: base, force: false }),
    ).rejects.toThrow('externally modified');
  });

  it('removes modified file when force is true', async () => {
    const base = makeTempDir();
    const skillDir = join(base, '.claude', 'skills', 'my-skill');
    mkdirSync(skillDir, { recursive: true });
    const skillPath = join(skillDir, 'SKILL.md');
    writeFileSync(skillPath, 'modified content');

    seed(base, {
      name: 'my-skill',
      platform: 'claude',
      installedPath: skillPath,
      contentHash: 'sha256:differenthash',
    });

    await uninstallSkill({ name: 'my-skill', platform: 'claude', homeDir: base, force: true });

    expect(existsSync(skillPath)).toBe(false);
  });
});
