import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { detectAgents } from '../../src/discovery/detectAgents';
import { cleanupTempRoots, createTempRoot, writeFile } from '../helpers/cliHarness';

describe('detectAgents', () => {
  afterEach(cleanupTempRoots);

  it('prefers agents configured in the current project over global-only agents', () => {
    const root = createTempRoot();
    const projectDir = join(root, 'project');
    const homeDir = join(root, 'home');
    writeFile(join(projectDir, '.codex', 'AGENTS.md'), '# project');
    writeFile(join(homeDir, '.claude', 'CLAUDE.md'), '# global');

    const agents = detectAgents(projectDir, { homeDir });

    expect(agents).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: 'codex', projectDetected: true, recommended: true }),
      expect.objectContaining({ platform: 'claude', globalDetected: true, projectDetected: false, recommended: false }),
    ]));
  });

  it('does not report agents without any known configuration path', () => {
    const root = createTempRoot();
    expect(detectAgents(join(root, 'project'), { homeDir: join(root, 'home') })).toEqual([]);
  });
});
