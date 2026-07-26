import * as fs from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { getDefaultCenterLibraryPath, getCenterStatePath, loadCenterLibrarySettings, saveCenterLibrarySettings } from '../../src/library/centerSettings.js';
import { getCenterView } from '../../src/application/center.js';
import { getManagedSkillPaths } from '../../src/library/paths.js';

const temporaryDirs: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('central library settings', () => {
  it('uses a dedicated Skill Doctor skill directory until the user selects another central library', () => {
    const homeDir = fs.mkdtempSync('/tmp/skill-doctor-center-settings-');
    temporaryDirs.push(homeDir);

    expect(loadCenterLibrarySettings(homeDir).rootPath).toBe(getDefaultCenterLibraryPath(homeDir));
    expect(getManagedSkillPaths(homeDir).baseDir).toBe(getCenterStatePath(homeDir));
    expect(getManagedSkillPaths(homeDir).skillsDir).toBe(getDefaultCenterLibraryPath(homeDir));
  });

  it('keeps managed state outside a custom library root', () => {
    const homeDir = fs.mkdtempSync('/tmp/skill-doctor-center-settings-');
    temporaryDirs.push(homeDir);
    const libraryRoot = join(homeDir, 'shared-skills');

    saveCenterLibrarySettings(libraryRoot, homeDir);

    expect(loadCenterLibrarySettings(homeDir).rootPath).toBe(libraryRoot);
    const paths = getManagedSkillPaths(homeDir);
    expect(paths.baseDir).toBe(getCenterStatePath(homeDir));
    expect(paths.skillsDir).toBe(libraryRoot);
    expect(paths.centerPath).toBe(join(getCenterStatePath(homeDir), 'center.json'));
  });

  it('registers every direct Skill directory from a selected library root without writing management files there', () => {
    const homeDir = fs.mkdtempSync('/tmp/skill-doctor-center-settings-');
    temporaryDirs.push(homeDir);
    const libraryRoot = join(homeDir, 'shared-skills');
    fs.mkdirSync(join(libraryRoot, 'first-skill'), { recursive: true });
    fs.mkdirSync(join(libraryRoot, 'second-skill'), { recursive: true });
    fs.writeFileSync(join(libraryRoot, 'first-skill', 'SKILL.md'), '# First Skill\n', 'utf8');
    fs.writeFileSync(join(libraryRoot, 'second-skill', 'SKILL.md'), '# Second Skill\n', 'utf8');

    saveCenterLibrarySettings(libraryRoot, homeDir);
    const view = getCenterView(homeDir, homeDir);

    expect(view.skills.map((skill) => skill.name).sort()).toEqual(['first-skill', 'second-skill']);
    expect(fs.existsSync(join(libraryRoot, 'center.json'))).toBe(false);
    expect(fs.existsSync(join(libraryRoot, 'staging'))).toBe(false);
    expect(fs.existsSync(join(libraryRoot, 'backups'))).toBe(false);
  });

  it('moves legacy management files out of a selected library root and preserves imported Skill directories', () => {
    const homeDir = fs.mkdtempSync('/tmp/skill-doctor-center-settings-');
    temporaryDirs.push(homeDir);
    const libraryRoot = join(homeDir, 'shared-skills');
    const legacySkill = join(libraryRoot, 'skills', 'legacy-skill');
    fs.mkdirSync(legacySkill, { recursive: true });
    fs.writeFileSync(join(legacySkill, 'SKILL.md'), '# Legacy Skill\n', 'utf8');
    fs.mkdirSync(join(libraryRoot, 'backups'), { recursive: true });
    fs.writeFileSync(join(libraryRoot, 'center.json'), JSON.stringify({
      version: 1,
      skills: [{ rootPath: legacySkill }],
    }), 'utf8');

    saveCenterLibrarySettings(libraryRoot, homeDir);
    const paths = getManagedSkillPaths(homeDir);

    expect(fs.existsSync(join(libraryRoot, 'center.json'))).toBe(false);
    expect(fs.existsSync(join(libraryRoot, 'backups'))).toBe(false);
    expect(fs.existsSync(join(libraryRoot, 'legacy-skill', 'SKILL.md'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(paths.centerPath, 'utf8')).skills[0].rootPath).toBe(join(libraryRoot, 'legacy-skill'));
  });
});
