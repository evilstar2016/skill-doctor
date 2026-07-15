import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DEFAULT_SKILL_COST_POLICY } from '../defaults';
import type { PlatformAdapter, PlatformInstructionCandidate, PlatformRuntimeContext } from '../types';

export const geminiAdapter: PlatformAdapter = {
  platform: 'gemini',
  displayName: 'Gemini CLI',
  aliases: [],
  confidence: 'high',
  global: [
    { path: '~/.gemini/GEMINI.md', mode: 'single-file' },
    { path: '~/.gemini/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
  ],
  project: [
    { path: '.gemini/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    { path: 'GEMINI.md', mode: 'single-file' },
  ],
  extensions: ['.md'],
  installTargets: [
    { targetId: 'gemini-global-skills', scope: 'global', path: '~/.gemini/skills', layout: 'skill-dirs' },
    { targetId: 'gemini-project-skills', scope: 'project', path: '.gemini/skills', layout: 'skill-dirs' },
  ],
  mcpConfigFiles: [
    { scope: 'global', path: '~/.gemini/settings.json', format: 'json' },
    { scope: 'project', path: '.gemini/settings.json', format: 'json' },
  ],
  costPolicy: DEFAULT_SKILL_COST_POLICY,
  discoverAdditionalInstructions: discoverConfiguredContextFiles,
};

function discoverConfiguredContextFiles(context: PlatformRuntimeContext): PlatformInstructionCandidate[] {
  return readContextFileNames(context)
    .filter((name) => name !== 'GEMINI.md')
    .flatMap((name) => [
      {
        filePath: join(context.homeDir, '.gemini', name),
        installSource: `~/.gemini/${name}`,
        scope: 'global' as const,
      },
      {
        filePath: join(context.projectDir, name),
        installSource: name,
        scope: 'project' as const,
      },
    ]);
}

function readContextFileNames(context: PlatformRuntimeContext): string[] {
  const names = new Set<string>(['GEMINI.md']);
  const settingsPaths = [
    join(context.homeDir, '.gemini', 'settings.json'),
    join(context.projectDir, '.gemini', 'settings.json'),
  ];

  for (const settingsPath of settingsPaths) {
    if (!existsSync(settingsPath)) continue;
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as { contextFileName?: string | string[] };
      const configured = settings.contextFileName;
      if (typeof configured === 'string' && configured.trim()) {
        names.add(configured.trim());
      } else if (Array.isArray(configured)) {
        for (const name of configured) {
          if (typeof name === 'string' && name.trim()) names.add(name.trim());
        }
      }
    } catch {
      continue;
    }
  }

  return [...names];
}
