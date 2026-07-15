import { describe, expect, it } from 'vitest';

import { getPlatformAdapter } from '../../src/platforms/registry';
import { createPlatformRuntime } from '../../src/platforms/runtime';
import type { SkillFile } from '../../src/types/skill';

const context = {
  projectDir: '/project',
  homeDir: '/home/tester',
  appDataDir: '/home/tester/AppData/Roaming',
};

describe('platform runtime', () => {
  it('uses the generic behavior when an adapter has no instruction hooks', () => {
    const adapter = getPlatformAdapter('cursor');
    expect(adapter).toBeDefined();

    const runtime = createPlatformRuntime(adapter!, context);
    const files: SkillFile[] = [];

    expect(runtime.discoverAdditionalInstructions()).toEqual([]);
    expect(runtime.postProcessInstructions(files)).toBe(files);
  });

  it('runs platform-specific instruction post-processing through the adapter', () => {
    const adapter = getPlatformAdapter('codex');
    expect(adapter).toBeDefined();

    const runtime = createPlatformRuntime(adapter!, context);
    const files: SkillFile[] = [
      skillFile('/project/AGENTS.md'),
      skillFile('/project/AGENTS.override.md'),
      skillFile('/project/nested/AGENTS.md'),
    ];

    expect(runtime.postProcessInstructions(files).map((file) => file.filePath)).toEqual([
      '/project/AGENTS.override.md',
      '/project/nested/AGENTS.md',
    ]);
  });
});

function skillFile(filePath: string): SkillFile {
  return {
    filePath,
    platform: 'codex',
    scope: 'project',
    confidence: 'high',
    installSource: 'AGENTS.md',
  };
}
