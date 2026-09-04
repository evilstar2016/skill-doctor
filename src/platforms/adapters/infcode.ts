import type { PlatformAdapter } from '../types';

const INFCODE_RULES_PATH = '/.infcode/rules/';

export const infcodeAdapter: PlatformAdapter = {
  platform: 'infcode',
  displayName: 'InfCode',
  aliases: [],
  confidence: 'high',
  global: [
    { path: '~/.infcode/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    { path: '~/.infcode/rules', mode: 'recursive-dir', layout: 'files' },
  ],
  project: [
    { path: '.infcode/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    { path: '.infcode/rules', mode: 'recursive-dir', layout: 'files' },
  ],
  detectionPaths: {
    global: ['~/.infcode'],
    project: ['.infcode'],
  },
  extensions: ['.md', '.mdc'],
  installTargets: [
    { targetId: 'infcode-global-skills', scope: 'global', path: '~/.infcode/skills', layout: 'skill-dirs' },
    { targetId: 'infcode-project-skills', scope: 'project', path: '.infcode/skills', layout: 'skill-dirs' },
  ],
  mcpConfigFiles: [
    { scope: 'project', path: '.infcode/mcpServers/mcp.json', format: 'json' },
  ],
  costPolicy: {
    rules: [
      {
        match: { pathIncludes: INFCODE_RULES_PATH, frontmatterEquals: { invokeMode: 'manual' } },
        profile: { mode: 'manual', kind: 'always-on-file' },
      },
      {
        match: { pathIncludes: INFCODE_RULES_PATH, frontmatterEquals: { trigger: 'manual' } },
        profile: { mode: 'manual', kind: 'always-on-file' },
      },
      {
        match: { pathIncludes: INFCODE_RULES_PATH, frontmatterEquals: { invokeMode: 'smart' } },
        profile: { mode: 'metadata', kind: 'always-on-file' },
      },
      {
        match: { pathIncludes: INFCODE_RULES_PATH, frontmatterEquals: { trigger: 'smart' } },
        profile: { mode: 'metadata', kind: 'always-on-file' },
      },
      {
        match: { pathIncludes: INFCODE_RULES_PATH, frontmatterTruthy: 'alwaysApply' },
        profile: { mode: 'always-on', kind: 'always-on-file' },
      },
      {
        match: { pathIncludes: INFCODE_RULES_PATH, frontmatterEquals: { invokeMode: 'always' } },
        profile: { mode: 'always-on', kind: 'always-on-file' },
      },
      {
        match: { pathIncludes: INFCODE_RULES_PATH, frontmatterEquals: { trigger: 'always' } },
        profile: { mode: 'always-on', kind: 'always-on-file' },
      },
      {
        match: { entryFile: true },
        profile: { mode: 'metadata', kind: 'agent-skill-description' },
      },
    ],
    defaultProfile: { mode: 'always-on', kind: 'always-on-file' },
  },
};
