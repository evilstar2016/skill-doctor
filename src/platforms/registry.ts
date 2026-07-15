import { join, normalize } from 'node:path';

import type { Platform } from '../types/skill';
import { PLATFORM_ADAPTERS } from './adapters';
import { DEFAULT_SKILL_COST_POLICY } from './defaults';
import type { PlatformAdapter, PlatformPathTarget } from './types';

export { PLATFORM_ADAPTERS } from './adapters';
export type {
  PathTarget,
  PlatformAdapter,
  PlatformCostPolicy,
  PlatformCostPolicyMatch,
  PlatformCostPolicyProfile,
  PlatformCostPolicyRule,
  PlatformCostProfileMode,
  PlatformInstallTarget,
  PlatformInstructionCandidate,
  PlatformMcpConfigSource,
  PlatformMcpJsonConfig,
  PlatformMcpJsonContext,
  PlatformPathDefinition,
  PlatformPathTarget,
  PlatformRuntimeContext,
  PlatformScanSource,
} from './types';

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

export function getPlatformAliasMappings(
  options: { includeUnknown?: boolean } = {},
): { alias: string; platform: Platform }[] {
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
      .replace(/^~(?=[/\\\\]|$)/, homeDir)
      .replace(/%USERPROFILE%/gi, homeDir)
      .replace(/%APPDATA%/gi, appDataDir),
  );
}

export function resolveCustomPath(rawPath: string, homeDir: string): string {
  return normalize(rawPath.startsWith('~') ? join(homeDir, rawPath.slice(2)) : rawPath);
}
