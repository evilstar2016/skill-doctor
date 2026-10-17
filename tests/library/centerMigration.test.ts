import * as fs from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { getCenterView } from '../../src/application/center.js';
import { loadCenterLibrarySettings, saveCenterLibrarySettings } from '../../src/library/centerSettings.js';
import { loadCenter, saveCenter, syncCenterLibrarySkills } from '../../src/library/centerStore.js';
import { migrateCenterLibrary, previewCenterLibraryChange } from '../../src/library/centerMigration.js';

const temporaryDirs: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function makeHome(): string {
  const homeDir = fs.mkdtempSync('/tmp/skill-doctor-center-migration-');
  temporaryDirs.push(homeDir);
  return homeDir;
}

function makeSkill(libraryRoot: string, name: string): string {
  const skillPath = join(libraryRoot, name);
  fs.mkdirSync(skillPath, { recursive: true });
  fs.writeFileSync(join(skillPath, 'SKILL.md'), `# ${name}\n`, 'utf8');
  return skillPath;
}

describe('central library migration', () => {
  it('previews only the managed skills the new root would orphan', () => {
    const homeDir = makeHome();
    const firstLibraryRoot = join(homeDir, 'first-library');
    const secondLibraryRoot = join(homeDir, 'second-library');
    makeSkill(firstLibraryRoot, 'alpha');
    makeSkill(firstLibraryRoot, 'beta');
    saveCenterLibrarySettings(firstLibraryRoot, homeDir);
    syncCenterLibrarySkills(homeDir);

    const preview = previewCenterLibraryChange(secondLibraryRoot, homeDir);

    expect(preview.affected).toBe(2);
    expect(preview.names.sort()).toEqual(['alpha', 'beta']);
    expect(previewCenterLibraryChange(firstLibraryRoot, homeDir)).toEqual({ affected: 0, names: [] });
  });

  it('moves skill directories, remaps the ledger, and keeps the view stable after switching', () => {
    const homeDir = makeHome();
    const firstLibraryRoot = join(homeDir, 'first-library');
    const secondLibraryRoot = join(homeDir, 'second-library');
    makeSkill(firstLibraryRoot, 'alpha');
    saveCenterLibrarySettings(firstLibraryRoot, homeDir);
    syncCenterLibrarySkills(homeDir);
    const previousId = loadCenter(homeDir).skills[0].id;

    const result = migrateCenterLibrary(secondLibraryRoot, homeDir);

    expect(result).toEqual({ moved: 1, relinked: 0, skipped: [] });
    expect(fs.existsSync(join(secondLibraryRoot, 'alpha', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(join(firstLibraryRoot, 'alpha'))).toBe(false);
    expect(loadCenterLibrarySettings(homeDir).rootPath).toBe(secondLibraryRoot);

    const store = loadCenter(homeDir);
    expect(store.skills).toHaveLength(1);
    expect(store.skills[0].id).toBe(previousId);
    expect(store.skills[0].rootPath).toBe(join(secondLibraryRoot, 'alpha'));

    const view = getCenterView(homeDir, homeDir);
    expect(view.skills.map((skill) => skill.name)).toEqual(['alpha']);
  });

  it('re-creates symlink installations so they resolve to the moved skill directory', () => {
    const homeDir = makeHome();
    const firstLibraryRoot = join(homeDir, 'first-library');
    const secondLibraryRoot = join(homeDir, 'second-library');
    const skillPath = makeSkill(firstLibraryRoot, 'alpha');
    saveCenterLibrarySettings(firstLibraryRoot, homeDir);
    syncCenterLibrarySkills(homeDir);

    const agentSkillDir = join(homeDir, '.claude', 'skills');
    fs.mkdirSync(agentSkillDir, { recursive: true });
    const linkPath = join(agentSkillDir, 'alpha');
    fs.symlinkSync(skillPath, linkPath, 'dir');
    const store = loadCenter(homeDir);
    store.skills[0].installations.push({
      id: 'install-1', targetId: 'claude:global', platform: 'claude', scope: 'global',
      mode: 'symlink', installedPath: linkPath, deployedHash: 'sha256:a', installedAt: '2026-01-01',
    });
    saveCenter(homeDir, store);

    const result = migrateCenterLibrary(secondLibraryRoot, homeDir);

    expect(result.relinked).toBe(1);
    expect(fs.realpathSync(linkPath)).toBe(fs.realpathSync(join(secondLibraryRoot, 'alpha')));
    expect(loadCenter(homeDir).skills[0].installations[0].installedPath).toBe(linkPath);
  });

  it('skips skills whose target name is already occupied and keeps their records untouched', () => {
    const homeDir = makeHome();
    const firstLibraryRoot = join(homeDir, 'first-library');
    const secondLibraryRoot = join(homeDir, 'second-library');
    const skillPath = makeSkill(firstLibraryRoot, 'alpha');
    fs.mkdirSync(join(secondLibraryRoot, 'alpha'), { recursive: true });
    saveCenterLibrarySettings(firstLibraryRoot, homeDir);
    syncCenterLibrarySkills(homeDir);

    const result = migrateCenterLibrary(secondLibraryRoot, homeDir);

    expect(result).toEqual({ moved: 0, relinked: 0, skipped: ['alpha'] });
    expect(fs.existsSync(join(skillPath, 'SKILL.md'))).toBe(true);
    expect(loadCenter(homeDir).skills[0].rootPath).toBe(skillPath);
  });

  it('refuses to switch to a path inside the current library', () => {
    const homeDir = makeHome();
    const firstLibraryRoot = join(homeDir, 'first-library');
    makeSkill(firstLibraryRoot, 'alpha');
    saveCenterLibrarySettings(firstLibraryRoot, homeDir);
    syncCenterLibrarySkills(homeDir);

    expect(() => migrateCenterLibrary(join(firstLibraryRoot, 'nested'), homeDir)).toThrow(/inside the current library/);
    expect(loadCenterLibrarySettings(homeDir).rootPath).toBe(firstLibraryRoot);
  });
});
