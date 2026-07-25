import * as fs from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { getDefaultCenterLibraryPath, loadCenterLibrarySettings, saveCenterLibrarySettings } from '../../src/library/centerSettings.js';
import { getManagedSkillPaths } from '../../src/library/paths.js';

const temporaryDirs: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('central library settings', () => {
  it('uses the Skill Doctor data directory until the user selects another central library', () => {
    const homeDir = fs.mkdtempSync('/tmp/skill-doctor-center-settings-');
    temporaryDirs.push(homeDir);

    expect(loadCenterLibrarySettings(homeDir).rootPath).toBe(getDefaultCenterLibraryPath(homeDir));
    expect(getManagedSkillPaths(homeDir).baseDir).toBe(getDefaultCenterLibraryPath(homeDir));
  });

  it('persists a custom library root and directs managed state into it', () => {
    const homeDir = fs.mkdtempSync('/tmp/skill-doctor-center-settings-');
    temporaryDirs.push(homeDir);
    const libraryRoot = join(homeDir, 'shared-skills');

    saveCenterLibrarySettings(libraryRoot, homeDir);

    expect(loadCenterLibrarySettings(homeDir).rootPath).toBe(libraryRoot);
    const paths = getManagedSkillPaths(homeDir);
    expect(paths.baseDir).toBe(libraryRoot);
    expect(paths.skillsDir).toBe(join(libraryRoot, 'skills'));
    expect(paths.centerPath).toBe(join(libraryRoot, 'center.json'));
  });
});
