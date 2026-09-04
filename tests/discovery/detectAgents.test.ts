import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { detectAgents } from '../../src/discovery/detectAgents';
import { loadEffectiveScanSources } from '../../src/config/scanSources';
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

  it('detects InfCode from its installation root when source-aware startup detection is used', () => {
    const root = createTempRoot();
    const projectDir = join(root, 'project');
    const homeDir = join(root, 'home');
    mkdirSync(join(homeDir, '.infcode'), { recursive: true });

    const agents = detectAgents(projectDir, {
      homeDir,
      sources: loadEffectiveScanSources(projectDir, { homeDir }),
    });

    expect(agents).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: 'infcode', projectDetected: false, globalDetected: true, recommended: false }),
    ]));
  });
});
