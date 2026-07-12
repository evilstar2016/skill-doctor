import { join, normalize } from 'node:path';

import type { ContextCostOfficialLimit, ContextInjectionKind } from '../types/context';
import type { Confidence, Platform } from '../types/skill';

export interface PlatformPathTarget {
  path: string;
  mode: 'recursive-dir' | 'single-file';
  layout?: 'files' | 'skill-dirs';
  includeFileNames?: string[];
  includeFileNameSuffixes?: string[];
  costOnly?: boolean;
}

export interface PlatformInstallTarget {
  targetId: string;
  scope: 'global' | 'project';
  path: string;
  layout: 'files' | 'skill-dirs';
}

export interface PlatformMcpConfigSource {
  scope: 'global' | 'project';
  path: string;
  format: 'json' | 'toml';
}

export interface PlatformAdapter {
  platform: Platform;
  displayName: string;
  aliases: string[];
  confidence: Confidence;
  global: PlatformPathTarget[];
  project: PlatformPathTarget[];
  extensions: string[];
  installTargets: PlatformInstallTarget[];
  mcpConfigFiles: PlatformMcpConfigSource[];
  costPolicy: PlatformCostPolicy;
}

export type PlatformPathDefinition = PlatformAdapter;
export type PathTarget = PlatformPathTarget;

export type PlatformCostProfileMode = 'metadata' | 'always-on' | 'file-scoped' | 'manual';

export interface PlatformCostPolicyProfile {
  mode: PlatformCostProfileMode;
  kind: ContextInjectionKind;
  includePath?: boolean;
  officialLimit?: ContextCostOfficialLimit;
}

export interface PlatformCostPolicyMatch {
  entryFile?: boolean;
  fileName?: string;
  fileNameIn?: string[];
  fileNameSuffix?: string;
  pathIncludes?: string;
  frontmatterTruthy?: string;
  frontmatterExists?: string;
  frontmatterEquals?: Record<string, string>;
}

export interface PlatformCostPolicyRule {
  match: PlatformCostPolicyMatch;
  profile: PlatformCostPolicyProfile;
}

export interface PlatformCostPolicy {
  rules: PlatformCostPolicyRule[];
  defaultProfile: PlatformCostPolicyProfile;
}

const CODEX_AGENTS_LIMIT_CHARS = 32 * 1024;
const CODEX_SKILL_LIST_LIMIT_CHARS = 8000;
const CLAUDE_SKILL_LIST_LIMIT_CHARS = 1536;

const DEFAULT_SKILL_COST_POLICY: PlatformCostPolicy = {
  rules: [
    {
      match: { entryFile: true },
      profile: { mode: 'metadata', kind: 'agent-skill-description' },
    },
  ],
  defaultProfile: { mode: 'always-on', kind: 'always-on-file' },
};

export const PLATFORM_ADAPTERS: PlatformAdapter[] = [
  {
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
  },
  {
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
    installTargets: [{ targetId: 'cursor-global-rules', scope: 'global', path: '~/.cursor/rules', layout: 'files' }],
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
  },
  {
    platform: 'copilot',
    displayName: 'GitHub Copilot',
    aliases: [],
    confidence: 'high',
    global: [
      { path: '~/.copilot/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
      { path: '~/.agents/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    ],
    project: [
      { path: '.github/copilot-instructions.md', mode: 'single-file' },
      { path: '.github/instructions', mode: 'recursive-dir', layout: 'files' },
      { path: '.github/prompts', mode: 'recursive-dir', layout: 'files', includeFileNameSuffixes: ['.prompt.md'] },
      { path: '.github/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
      { path: '.claude/skills', mode: 'recursive-dir', layout: 'skill-dirs', costOnly: true },
      { path: '.agents/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
      { path: 'AGENTS.md', mode: 'single-file', costOnly: true },
      { path: 'CLAUDE.md', mode: 'single-file', costOnly: true },
      { path: 'GEMINI.md', mode: 'single-file', costOnly: true },
    ],
    extensions: ['.md'],
    installTargets: [
      { targetId: 'copilot-global-skills', scope: 'global', path: '~/.copilot/skills', layout: 'skill-dirs' },
      { targetId: 'copilot-global-agents-skills', scope: 'global', path: '~/.agents/skills', layout: 'skill-dirs' },
      { targetId: 'copilot-project-skills', scope: 'project', path: '.github/skills', layout: 'skill-dirs' },
      { targetId: 'copilot-project-agents-skills', scope: 'project', path: '.agents/skills', layout: 'skill-dirs' },
    ],
    mcpConfigFiles: [
      { scope: 'project', path: '.vscode/mcp.json', format: 'json' },
      { scope: 'project', path: '.github/mcp.json', format: 'json' },
    ],
    costPolicy: {
      rules: [
        {
          match: { entryFile: true },
          profile: { mode: 'metadata', kind: 'agent-skill-description' },
        },
        {
          match: { fileNameSuffix: '.prompt.md' },
          profile: { mode: 'manual', kind: 'copilot-prompt-file' },
        },
        {
          match: { fileNameSuffix: '.instructions.md' },
          profile: { mode: 'file-scoped', kind: 'copilot-instruction-file' },
        },
        {
          match: { fileNameIn: ['agents.md', 'claude.md', 'gemini.md'] },
          profile: { mode: 'always-on', kind: 'always-on-file' },
        },
      ],
      defaultProfile: { mode: 'always-on', kind: 'copilot-instruction-file' },
    },
  },
  {
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
  },
  {
    platform: 'gemini',
    displayName: 'Gemini CLI',
    aliases: [],
    confidence: 'high',
    global: [
      { path: '~/.gemini/GEMINI.md', mode: 'single-file' },
      { path: '~/.gemini/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    ],
    project: [
      { path: '.gemini/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
      { path: 'GEMINI.md', mode: 'single-file' },
    ],
    extensions: ['.md'],
    installTargets: [
      { targetId: 'gemini-global-skills', scope: 'global', path: '~/.gemini/skills', layout: 'skill-dirs' },
      { targetId: 'gemini-project-skills', scope: 'project', path: '.gemini/skills', layout: 'skill-dirs' },
    ],
    mcpConfigFiles: [
      { scope: 'global', path: '~/.gemini/settings.json', format: 'json' },
      { scope: 'project', path: '.gemini/settings.json', format: 'json' },
    ],
    costPolicy: DEFAULT_SKILL_COST_POLICY,
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
    platform: 'openclaw',
    displayName: 'OpenClaw',
    aliases: [],
    confidence: 'high',
    global: [{ path: '~/.openclaw/skills', mode: 'recursive-dir', layout: 'skill-dirs' }],
    project: [],
    extensions: ['.md'],
    installTargets: [{ targetId: 'openclaw-global-skills', scope: 'global', path: '~/.openclaw/skills', layout: 'skill-dirs' }],
    mcpConfigFiles: [],
    costPolicy: DEFAULT_SKILL_COST_POLICY,
  },
  {
    platform: 'hermes',
    displayName: 'Hermes',
    aliases: [],
    confidence: 'high',
    global: [{ path: '~/.config/hermes/skills', mode: 'recursive-dir', layout: 'skill-dirs' }],
    project: [],
    extensions: ['.md'],
    installTargets: [{ targetId: 'hermes-global-skills', scope: 'global', path: '~/.config/hermes/skills', layout: 'skill-dirs' }],
    mcpConfigFiles: [],
    costPolicy: DEFAULT_SKILL_COST_POLICY,
  },
];

export const UNKNOWN_PLATFORM_ADAPTER: PlatformAdapter = {
  platform: 'unknown',
  displayName: 'Unknown/custom paths',
  aliases: [],
  confidence: 'low',
  global: [],
  project: [],
  extensions: ['.md'],
  installTargets: [],
  mcpConfigFiles: [],
  costPolicy: DEFAULT_SKILL_COST_POLICY,
};

export function getPlatformAdapters(): PlatformAdapter[] {
  return [...PLATFORM_ADAPTERS];
}

export function getAllPlatformAdapters(): PlatformAdapter[] {
  return [...PLATFORM_ADAPTERS, UNKNOWN_PLATFORM_ADAPTER];
}

export function getPlatformCliValues(options: { includeUnknown?: boolean } = {}): Platform[] {
  const adapters = options.includeUnknown ? getAllPlatformAdapters() : getPlatformAdapters();
  return adapters.map((adapter) => adapter.platform);
}

export function getPlatformAliasMappings(options: { includeUnknown?: boolean } = {}): { alias: string; platform: Platform }[] {
  const adapters = options.includeUnknown ? getAllPlatformAdapters() : getPlatformAdapters();
  return adapters.flatMap((adapter) => adapter.aliases.map((alias) => ({ alias, platform: adapter.platform })));
}

export function getPlatformAdapter(value: string | undefined): PlatformAdapter | undefined {
  const platform = normalizePlatformName(value);
  if (!platform) return undefined;
  return getAllPlatformAdapters().find((adapter) => adapter.platform === platform);
}

export function getCanonicalPlatformAdapter(value: string | undefined): PlatformAdapter | undefined {
  if (!value) return undefined;
  return PLATFORM_ADAPTERS.find((adapter) => adapter.platform === value);
}

export function normalizePlatformName(value: string | undefined): Platform | null {
  if (!value) return null;
  const normalized = value.toLowerCase();

  for (const adapter of getAllPlatformAdapters()) {
    if (adapter.platform === normalized || adapter.aliases.includes(normalized)) {
      return adapter.platform;
    }
  }

  return null;
}

export function getDefaultInstallTarget(adapter: PlatformAdapter): PlatformPathTarget | undefined {
  const target = adapter.installTargets.find((entry) => entry.scope === 'global');
  return target
    ? {
        path: target.path,
        mode: 'recursive-dir',
        layout: target.layout,
      }
    : undefined;
}

export function resolvePlatformPathTemplate(template: string, homeDir: string, appDataDir: string): string {
  return normalize(
    template
      .replace(/^~(?=[/\\]|$)/, homeDir)
      .replace(/%USERPROFILE%/gi, homeDir)
      .replace(/%APPDATA%/gi, appDataDir),
  );
}

export function resolveCustomPath(rawPath: string, homeDir: string): string {
  return normalize(rawPath.startsWith('~') ? join(homeDir, rawPath.slice(2)) : rawPath);
}
