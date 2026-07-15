import { DEFAULT_SKILL_COST_POLICY } from '../defaults';
import type { PlatformAdapter } from '../types';

export const traeAdapter: PlatformAdapter = {
  platform: 'trae',
  displayName: 'Trae',
  aliases: [],
  confidence: 'low',
  global: [{ path: '~/.trae/skills', mode: 'recursive-dir', layout: 'skill-dirs' }],
  project: [{ path: '.trae/skills', mode: 'recursive-dir', layout: 'skill-dirs' }],
  extensions: ['.md'],
  installTargets: [
    { targetId: 'trae-global-skills', scope: 'global', path: '~/.trae/skills', layout: 'skill-dirs' },
    { targetId: 'trae-project-skills', scope: 'project', path: '.trae/skills', layout: 'skill-dirs' },
  ],
  mcpConfigFiles: [],
  costPolicy: DEFAULT_SKILL_COST_POLICY,
};
