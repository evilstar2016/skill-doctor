import { DEFAULT_SKILL_COST_POLICY } from '../defaults';
import type { PlatformAdapter } from '../types';

export const kiroAdapter: PlatformAdapter = {
  platform: 'kiro',
  displayName: 'Kiro',
  aliases: [],
  confidence: 'high',
  global: [{ path: '~/.kiro/skills', mode: 'recursive-dir', layout: 'skill-dirs' }],
  project: [{ path: '.kiro/skills', mode: 'recursive-dir', layout: 'skill-dirs' }],
  extensions: ['.md'],
  installTargets: [
    { targetId: 'kiro-global-skills', scope: 'global', path: '~/.kiro/skills', layout: 'skill-dirs' },
    { targetId: 'kiro-project-skills', scope: 'project', path: '.kiro/skills', layout: 'skill-dirs' },
  ],
  mcpConfigFiles: [],
  costPolicy: DEFAULT_SKILL_COST_POLICY,
};
