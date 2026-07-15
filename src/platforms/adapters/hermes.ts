import { DEFAULT_SKILL_COST_POLICY } from '../defaults';
import type { PlatformAdapter } from '../types';

export const hermesAdapter: PlatformAdapter = {
  platform: 'hermes',
  displayName: 'Hermes',
  aliases: [],
  confidence: 'high',
  global: [{ path: '~/.config/hermes/skills', mode: 'recursive-dir', layout: 'skill-dirs' }],
  project: [],
  extensions: ['.md'],
  installTargets: [
    { targetId: 'hermes-global-skills', scope: 'global', path: '~/.config/hermes/skills', layout: 'skill-dirs' },
  ],
  mcpConfigFiles: [],
  costPolicy: DEFAULT_SKILL_COST_POLICY,
};
