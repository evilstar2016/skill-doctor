import { basename, dirname } from 'node:path';

import { loadCodexContextConfig, resolveCodexPath } from '../../context/codexContextConfig';
import type { SkillFile } from '../../types/skill';
import { CODEX_AGENTS_LIMIT_CHARS, CODEX_SKILL_LIST_LIMIT_CHARS } from '../defaults';
import type { PlatformAdapter, PlatformRuntimeContext, PlatformScanSource } from '../types';

export const codexAdapter: PlatformAdapter = {
  platform: 'codex',
  displayName: 'Codex',
  aliases: [],
  confidence: 'high',
  global: [
    { path: '~/.codex/AGENTS.override.md', mode: 'single-file' },
    { path: '~/.codex/AGENTS.md', mode: 'single-file' },
    { path: '~/.codex/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    { path: '~/.agent/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    { path: '~/.agents/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    { path: '/etc/codex/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
  ],
  project: [
    { path: 'AGENTS.override.md', mode: 'single-file' },
    { path: 'AGENTS.md', mode: 'single-file' },
    { path: '.codex/AGENTS.override.md', mode: 'single-file' },
    { path: '.codex/AGENTS.md', mode: 'single-file' },
    { path: '.codex/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    { path: '.agent/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    { path: '.agents/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
  ],
  extensions: ['.md'],
  installTargets: [
    { targetId: 'codex-global-skills', scope: 'global', path: '~/.codex/skills', layout: 'skill-dirs' },
    { targetId: 'codex-global-agent-skills', scope: 'global', path: '~/.agent/skills', layout: 'skill-dirs' },
    { targetId: 'codex-global-agents-skills', scope: 'global', path: '~/.agents/skills', layout: 'skill-dirs' },
    { targetId: 'codex-project-skills', scope: 'project', path: '.codex/skills', layout: 'skill-dirs' },
    { targetId: 'codex-project-agent-skills', scope: 'project', path: '.agent/skills', layout: 'skill-dirs' },
    { targetId: 'codex-project-agents-skills', scope: 'project', path: '.agents/skills', layout: 'skill-dirs' },
  ],
  mcpConfigFiles: [
    { scope: 'global', path: '~/.codex/config.toml', format: 'toml' },
    { scope: 'project', path: '.codex/config.toml', format: 'toml' },
  ],
  costPolicy: {
    rules: [
      {
        match: { entryFile: true },
        profile: {
          mode: 'metadata',
          kind: 'agent-skill-description',
          includePath: true,
          officialLimit: {
            kind: 'chars',
            value: CODEX_SKILL_LIST_LIMIT_CHARS,
            appliesTo: 'initial skill list when context window is unknown',
          },
        },
      },
    ],
    defaultProfile: {
      mode: 'always-on',
      kind: 'always-on-file',
      officialLimit: {
        kind: 'chars',
        value: CODEX_AGENTS_LIMIT_CHARS,
        appliesTo: 'combined AGENTS.md instruction chain',
      },
    },
  },
  getBuiltinScanSources: getCodexBuiltinScanSources,
  resolveScanSourcePath: ({ path }, context) => resolveCodexPath(path, context.projectDir, context.homeDir),
  postProcessInstructions: applyAgentOverridePrecedence,
};

function getCodexBuiltinScanSources(context: PlatformRuntimeContext): PlatformScanSource[] {
  const config = loadCodexContextConfig({ homeDir: context.homeDir }).config;
  const skills: PlatformScanSource[] = config.skillDirs.map((entry) => ({
    id: entry.id,
    platform: 'codex',
    resource: 'skill',
    scope: entry.scope,
    path: entry.path,
    enabled: entry.enabled !== false,
    mode: 'recursive-dir',
    layout: 'skill-dirs',
    origin: sourceOrigin(entry.configSource),
  }));
  const mcp: PlatformScanSource[] = config.mcpConfigFiles.map((entry) => ({
    id: entry.id,
    platform: 'codex',
    resource: 'mcp',
    scope: entry.scope,
    path: entry.path,
    enabled: entry.enabled !== false,
    format: entry.format,
    origin: sourceOrigin(entry.configSource),
  }));
  const plugins: PlatformScanSource[] = config.pluginDirs.map((entry) => ({
    id: entry.id,
    platform: 'codex',
    resource: 'plugin',
    scope: entry.scope,
    path: entry.manifestGlob,
    enabled: entry.enabled !== false,
    skillsField: entry.skillsField,
    defaultSkillsDir: entry.defaultSkillsDir,
    origin: sourceOrigin(entry.configSource),
  }));

  return [...skills, ...mcp, ...plugins];
}

function sourceOrigin(configSource: string | undefined): 'builtin' | 'override' {
  return configSource?.startsWith('builtin:') ? 'builtin' : 'override';
}

function applyAgentOverridePrecedence(files: SkillFile[]): SkillFile[] {
  const overrideDirs = new Set(
    files
      .filter((entry) => entry.platform === 'codex' && basename(entry.filePath).toLowerCase() === 'agents.override.md')
      .map((entry) => `${entry.scope}|${dirname(entry.filePath)}`),
  );

  return files.filter((entry) => {
    if (entry.platform !== 'codex') return true;
    if (basename(entry.filePath).toLowerCase() !== 'agents.md') return true;
    return !overrideDirs.has(`${entry.scope}|${dirname(entry.filePath)}`);
  });
}
