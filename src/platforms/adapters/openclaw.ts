import { DEFAULT_SKILL_COST_POLICY } from '../defaults';
import type { PlatformAdapter } from '../types';

export const openclawAdapter: PlatformAdapter = {
  platform: 'openclaw',
  displayName: 'OpenClaw',
  aliases: [],
  confidence: 'high',
  global: [{ path: '~/.openclaw/skills', mode: 'recursive-dir', layout: 'skill-dirs' }],
  project: [],
  extensions: ['.md'],
  installTargets: [
    { targetId: 'openclaw-global-skills', scope: 'global', path: '~/.openclaw/skills', layout: 'skill-dirs' },
  ],
  mcpConfigFiles: [],
  costPolicy: DEFAULT_SKILL_COST_POLICY,
};
