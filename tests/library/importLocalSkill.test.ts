import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const catalogWrite = vi.hoisted(() => ({ fail: false }));

vi.mock('../../src/library/centerStore.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/library/centerStore.js')>();
  return {
    ...actual,
    upsertManagedSkill(...args: Parameters<typeof actual.upsertManagedSkill>) {
      if (catalogWrite.fail) throw new Error('catalog write failed');
      return actual.upsertManagedSkill(...args);
    },
  };
});

import { loadCenter } from '../../src/library/centerStore.js';
import { importLocalSkill } from '../../src/library/importLocalSkill.js';
import { getManagedSkillPaths } from '../../src/library/paths.js';
import { hashSkillDirectory } from '../../src/library/skillDirectory.js';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  tempRoots.length = 0;
  catalogWrite.fail = false;
  vi.restoreAllMocks();
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(join(tmpdir(), 'skill-doctor-library-'));
  tempRoots.push(root);
  return root;
}

function writeSkill(root: string, name = 'review-skill'): string {
  const skillRoot = join(root, name);
  fs.mkdirSync(join(skillRoot, 'assets'), { recursive: true });
  fs.mkdirSync(join(skillRoot, 'scripts'), { recursive: true });
  fs.writeFileSync(
    join(skillRoot, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Review changes safely\n---\n\n# ${name}\n`,
    'utf8',
  );
  fs.writeFileSync(join(skillRoot, 'assets', 'checklist.txt'), 'Review the tests.\n', 'utf8');
  const scriptPath = join(skillRoot, 'scripts', 'check.sh');
  fs.writeFileSync(scriptPath, '#!/bin/sh\necho check\n', 'utf8');
  fs.chmodSync(scriptPath, 0o755);
  return skillRoot;
}

describe('hashSkillDirectory', () => {
  it.skipIf(process.platform === 'win32')(
    'is stable across creation order and changes when content, paths, or modes change',
    () => {
    const root = makeTempRoot();
    const first = join(root, 'first');
    const second = join(root, 'second');
    fs.mkdirSync(first, { recursive: true });
    fs.mkdirSync(second, { recursive: true });

    fs.writeFileSync(join(first, 'SKILL.md'), '# first\n', 'utf8');
    fs.mkdirSync(join(first, 'scripts'));
    fs.writeFileSync(join(first, 'scripts', 'run.sh'), 'echo run\n', 'utf8');
    fs.chmodSync(join(first, 'scripts', 'run.sh'), 0o755);

    fs.mkdirSync(join(second, 'scripts'));
    fs.writeFileSync(join(second, 'scripts', 'run.sh'), 'echo run\n', 'utf8');
    fs.chmodSync(join(second, 'scripts', 'run.sh'), 0o755);
    fs.writeFileSync(join(second, 'SKILL.md'), '# first\n', 'utf8');

    expect(hashSkillDirectory(first)).toBe(hashSkillDirectory(second));

    fs.chmodSync(join(second, 'scripts', 'run.sh'), 0o644);
    expect(hashSkillDirectory(first)).not.toBe(hashSkillDirectory(second));

    fs.chmodSync(join(second, 'scripts', 'run.sh'), 0o755);
    fs.renameSync(join(second, 'scripts', 'run.sh'), join(second, 'scripts', 'execute.sh'));
    expect(hashSkillDirectory(first)).not.toBe(hashSkillDirectory(second));
  });
});

describe('importLocalSkill', () => {
  it('imports a complete directory and persists a restart-loadable center store', () => {
    const root = makeTempRoot();
    const homeDir = join(root, 'home');
    const source = writeSkill(join(root, 'source'));
    fs.mkdirSync(join(source, '.git'), { recursive: true });
    fs.writeFileSync(join(source, '.git', 'config'), '[core]\n', 'utf8');
    const result = importLocalSkill({ sourcePath: source, homeDir });
    const paths = getManagedSkillPaths(homeDir);

    expect(result.imported).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(fs.readFileSync(join(result.skill.rootPath, 'assets', 'checklist.txt'), 'utf8')).toBe('Review the tests.\n');
    expect(fs.readFileSync(join(result.skill.rootPath, 'scripts', 'check.sh'), 'utf8')).toContain('echo check');
    // Executable bit preservation relies on POSIX modes, which Windows does not honor.
    if (process.platform !== 'win32') {
      expect(fs.statSync(join(result.skill.rootPath, 'scripts', 'check.sh')).mode & 0o111).not.toBe(0);
    }
    expect(fs.existsSync(join(result.skill.rootPath, '.git'))).toBe(false);
    expect(loadCenter(homeDir).skills).toHaveLength(1);
    expect(loadCenter(homeDir).skills[0]).toMatchObject({ id: result.skill.id, name: result.skill.name });
  });

  it('recognizes identical complete content without creating a second managed directory', () => {
    const root = makeTempRoot();
    const homeDir = join(root, 'home');
    const first = writeSkill(join(root, 'first-source'));
    const second = writeSkill(join(root, 'second-source'));

    const initial = importLocalSkill({ sourcePath: first, homeDir });
    const duplicate = importLocalSkill({ sourcePath: second, homeDir });
    const paths = getManagedSkillPaths(homeDir);

    expect(duplicate).toMatchObject({ imported: false, duplicate: true, skill: initial.skill });
    expect(loadCenter(homeDir).skills).toHaveLength(1);
    expect(fs.readdirSync(paths.skillsDir)).toHaveLength(1);
  });

  it('rejects a same-name skill with different content without creating a second managed directory', () => {
    const root = makeTempRoot();
    const homeDir = join(root, 'home');
    const first = writeSkill(join(root, 'first-source'));
    const second = writeSkill(join(root, 'second-source'));
    fs.appendFileSync(join(second, 'SKILL.md'), 'Different instructions.\n', 'utf8');

    importLocalSkill({ sourcePath: first, homeDir });
    expect(() => importLocalSkill({ sourcePath: second, homeDir })).toThrow('different content');

    const paths = getManagedSkillPaths(homeDir);
    expect(loadCenter(homeDir).skills).toHaveLength(1);
    expect(fs.readdirSync(paths.skillsDir)).toHaveLength(1);
  });

  it('rejects invalid roots without creating library state', () => {
    const root = makeTempRoot();
    const homeDir = join(root, 'home');
    const sourceFile = join(root, 'not-a-skill.md');
    fs.writeFileSync(sourceFile, '# Not a skill\n', 'utf8');

    expect(() => importLocalSkill({ sourcePath: sourceFile, homeDir })).toThrow('SKILL.md');

    const paths = getManagedSkillPaths(homeDir);
    expect(fs.existsSync(paths.catalogPath)).toBe(false);
    expect(fs.existsSync(paths.skillsDir)).toBe(false);
    expect(loadCenter(homeDir).skills).toHaveLength(0);
  });

  it.skipIf(process.platform === 'win32')('rejects symlinks that escape the skill root without creating library state', () => {
    const root = makeTempRoot();
    const homeDir = join(root, 'home');
    const source = writeSkill(join(root, 'source'));
    const outside = join(root, 'outside.txt');
    fs.writeFileSync(outside, 'private\n', 'utf8');
    fs.symlinkSync(outside, join(source, 'assets', 'outside.txt'));

    expect(() => importLocalSkill({ sourcePath: source, homeDir })).toThrow('escapes the skill root');

    const paths = getManagedSkillPaths(homeDir);
    expect(fs.existsSync(paths.catalogPath)).toBe(false);
    expect(fs.existsSync(paths.skillsDir)).toBe(false);
    expect(loadCenter(homeDir).skills).toHaveLength(0);
  });

  it('rolls back the promoted directory when center persistence fails', () => {
    const root = makeTempRoot();
    const homeDir = join(root, 'home');
    const source = writeSkill(join(root, 'source'));
    const paths = getManagedSkillPaths(homeDir);
    catalogWrite.fail = true;

    expect(() => importLocalSkill({ sourcePath: source, homeDir })).toThrow('catalog write failed');

    expect(fs.existsSync(paths.centerPath)).toBe(false);
    expect(fs.existsSync(paths.skillsDir) ? fs.readdirSync(paths.skillsDir) : []).toEqual([]);
    expect(fs.existsSync(paths.stagingDir) ? fs.readdirSync(paths.stagingDir) : []).toEqual([]);
  });
});
