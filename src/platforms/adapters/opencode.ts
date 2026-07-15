import { DEFAULT_SKILL_COST_POLICY } from '../defaults';
import type { PlatformAdapter } from '../types';

export const opencodeAdapter: PlatformAdapter = {
  platform: 'opencode',
  displayName: 'OpenCode',
  aliases: [],
  confidence: 'low',
  global: [
    { path: '~/.config/opencode/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    { path: '%APPDATA%/opencode/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
  ],
  project: [
    { path: 'AGENTS.md', mode: 'single-file' },
    { path: 'skills', mode: 'recursive-dir', layout: 'skill-dirs' },
  ],
  extensions: ['.md'],
  installTargets: [
    { targetId: 'opencode-global-config-skills', scope: 'global', path: '~/.config/opencode/skills', layout: 'skill-dirs' },
    { targetId: 'opencode-global-appdata-skills', scope: 'global', path: '%APPDATA%/opencode/skills', layout: 'skill-dirs' },
    { targetId: 'opencode-project-skills', scope: 'project', path: 'skills', layout: 'skill-dirs' },
  ],
  mcpConfigFiles: [],
  costPolicy: DEFAULT_SKILL_COST_POLICY,
};
