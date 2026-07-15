import { realpathSync } from 'node:fs';
import { basename } from 'node:path';

import { CLAUDE_SKILL_LIST_LIMIT_CHARS } from '../defaults';
import type { PlatformAdapter, PlatformMcpJsonConfig, PlatformMcpJsonContext } from '../types';

export const claudeAdapter: PlatformAdapter = {
  platform: 'claude',
  displayName: 'Claude Code',
  aliases: ['claudecode', 'claude-code'],
  confidence: 'high',
  global: [
    { path: '~/.claude/CLAUDE.md', mode: 'single-file' },
    { path: '~/.claude/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
  ],
  project: [
    { path: 'CLAUDE.md', mode: 'single-file' },
    { path: '.claude/CLAUDE.md', mode: 'single-file' },
    { path: '.claude/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    { path: '.claude/commands', mode: 'recursive-dir', layout: 'files' },
  ],
  extensions: ['.md'],
  installTargets: [
    { targetId: 'claude-global-skills', scope: 'global', path: '~/.claude/skills', layout: 'skill-dirs' },
    { targetId: 'claude-project-skills', scope: 'project', path: '.claude/skills', layout: 'skill-dirs' },
  ],
  mcpConfigFiles: [
    { scope: 'global', path: '~/.claude.json', format: 'json' },
    { scope: 'project', path: '.mcp.json', format: 'json' },
  ],
  costPolicy: {
    rules: [
      {
        match: { pathIncludes: '/.claude/commands/' },
        profile: {
          mode: 'metadata',
          kind: 'claude-skill-description',
          officialLimit: {
            kind: 'chars',
            value: CLAUDE_SKILL_LIST_LIMIT_CHARS,
            appliesTo: 'combined description and when_to_use skill listing',
          },
        },
      },
      {
        match: { entryFile: true, frontmatterTruthy: 'disable-model-invocation' },
        profile: { mode: 'manual', kind: 'claude-skill-description' },
      },
      {
        match: { entryFile: true },
        profile: {
          mode: 'metadata',
          kind: 'claude-skill-description',
          officialLimit: {
            kind: 'chars',
            value: CLAUDE_SKILL_LIST_LIMIT_CHARS,
            appliesTo: 'combined description and when_to_use skill listing',
          },
        },
      },
    ],
    defaultProfile: { mode: 'always-on', kind: 'always-on-file' },
  },
  discoverAdditionalMcpJsonConfigs: discoverProjectMcpConfigs,
};

function discoverProjectMcpConfigs(
  parsed: Record<string, unknown>,
  context: PlatformMcpJsonContext,
): PlatformMcpJsonConfig[] {
  if (context.scope !== 'global' || !isObject(parsed.projects)) return [];

  const configs: PlatformMcpJsonConfig[] = [];
  for (const key of getProjectKeys(context.projectDir)) {
    const projectConfig = parsed.projects[key];
    if (!isObject(projectConfig) || !isObject(projectConfig.mcpServers)) continue;
    configs.push({
      servers: projectConfig.mcpServers,
      baseConfig: isObject(projectConfig.mcp) ? projectConfig.mcp : undefined,
      scope: 'project',
    });
  }
  return configs;
}

function getProjectKeys(projectDir: string): string[] {
  const keys = new Set<string>([projectDir, basename(projectDir)]);
  try {
    keys.add(realpathSync(projectDir));
  } catch {
    // Keep the literal project path when realpath is unavailable.
  }
  return [...keys];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
