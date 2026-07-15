import type { PlatformAdapter } from '../types';

export const windsurfAdapter: PlatformAdapter = {
  platform: 'windsurf',
  displayName: 'Windsurf',
  aliases: [],
  confidence: 'high',
  global: [
    { path: '~/.codeium/windsurf/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    { path: '~/.codeium/windsurf/memories/global_rules.md', mode: 'single-file' },
    { path: '~/.agents/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
  ],
  project: [
    { path: '.windsurfrules', mode: 'single-file' },
    { path: 'AGENTS.md', mode: 'single-file', costOnly: true },
    { path: '.windsurf/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    { path: '.agents/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    { path: '.devin/rules', mode: 'recursive-dir', layout: 'files' },
    { path: '.windsurf/rules', mode: 'recursive-dir', layout: 'files' },
  ],
  extensions: ['.md'],
  installTargets: [
    { targetId: 'windsurf-global-skills', scope: 'global', path: '~/.codeium/windsurf/skills', layout: 'skill-dirs' },
    { targetId: 'windsurf-global-agents-skills', scope: 'global', path: '~/.agents/skills', layout: 'skill-dirs' },
    { targetId: 'windsurf-project-skills', scope: 'project', path: '.windsurf/skills', layout: 'skill-dirs' },
    { targetId: 'windsurf-project-agents-skills', scope: 'project', path: '.agents/skills', layout: 'skill-dirs' },
  ],
  mcpConfigFiles: [],
  costPolicy: {
    rules: [
      {
        match: { entryFile: true },
        profile: { mode: 'metadata', kind: 'agent-skill-description' },
      },
      {
        match: { fileNameIn: ['global_rules.md', '.windsurfrules', 'agents.md'] },
        profile: { mode: 'always-on', kind: 'always-on-file' },
      },
      {
        match: { frontmatterEquals: { trigger: 'always_on' } },
        profile: { mode: 'always-on', kind: 'always-on-file' },
      },
      {
        match: { frontmatterEquals: { trigger: 'model_decision' } },
        profile: { mode: 'metadata', kind: 'always-on-file' },
      },
      {
        match: { frontmatterEquals: { trigger: 'glob' } },
        profile: { mode: 'file-scoped', kind: 'always-on-file' },
      },
      {
        match: { frontmatterEquals: { trigger: 'manual' } },
        profile: { mode: 'manual', kind: 'always-on-file' },
      },
    ],
    defaultProfile: { mode: 'always-on', kind: 'always-on-file' },
  },
};
