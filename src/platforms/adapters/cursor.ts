import type { PlatformAdapter } from '../types';

export const cursorAdapter: PlatformAdapter = {
  platform: 'cursor',
  displayName: 'Cursor',
  aliases: [],
  confidence: 'high',
  global: [{ path: '~/.cursor/rules', mode: 'recursive-dir', layout: 'files' }],
  project: [
    { path: '.cursor/rules', mode: 'recursive-dir', layout: 'files' },
    { path: '.cursorrules', mode: 'single-file' },
  ],
  extensions: ['.md', '.mdc'],
  installTargets: [
    { targetId: 'cursor-global-rules', scope: 'global', path: '~/.cursor/rules', layout: 'files' },
  ],
  mcpConfigFiles: [
    { scope: 'global', path: '~/.cursor/mcp.json', format: 'json' },
    { scope: 'project', path: '.cursor/mcp.json', format: 'json' },
  ],
  costPolicy: {
    rules: [
      {
        match: { fileName: '.cursorrules' },
        profile: { mode: 'always-on', kind: 'always-on-file' },
      },
      {
        match: { frontmatterTruthy: 'alwaysApply' },
        profile: { mode: 'always-on', kind: 'cursor-rule-file' },
      },
      {
        match: { frontmatterExists: 'globs' },
        profile: { mode: 'file-scoped', kind: 'cursor-rule-file' },
      },
      {
        match: { frontmatterExists: 'description' },
        profile: { mode: 'metadata', kind: 'cursor-rule-file' },
      },
    ],
    defaultProfile: { mode: 'manual', kind: 'cursor-rule-file' },
  },
};
