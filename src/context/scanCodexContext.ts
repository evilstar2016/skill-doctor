import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from 'node:path';

import { discoverMcpToolsForServers } from '../mcp/listMcpTools';
import { scanMcpServers, type McpConfigFile } from '../mcp/scanMcpServers';
import { parseSkill } from '../parsing/parseSkill';
import type { ContextResourceRecord } from '../types/context';
import type { McpServerRecord } from '../types/mcp';
import type { Scope, SkillFile, SkillRecord } from '../types/skill';
import {
  type CodexContextConfig,
  type CodexResourceFilter,
  expandCodexGlob,
  getCodexProjectConfigPath,
  loadCodexContextConfig,
  resolveCodexPath,
} from './codexContextConfig';

export interface ScanCodexContextOptions {
  homeDir?: string;
  configPath?: string;
  resource?: CodexResourceFilter;
  includeDisabled?: boolean;
  discoverMcpTools?: boolean;
}

export type CodexContextEntry = SkillRecord | McpServerRecord | ContextResourceRecord;

const IGNORED_SKILL_DIRS = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', 'coverage']);

export async function scanCodexContextEntries(
  projectDir: string,
  options: ScanCodexContextOptions = {},
): Promise<CodexContextEntry[]> {
  const loaded = loadCodexContextConfig({ homeDir: options.homeDir, projectDir, configPath: options.configPath });
  const { config } = loaded;
  const homeDir = options.homeDir ?? process.env.HOME ?? process.env.USERPROFILE;
  const resolvedHome = homeDir ?? '';
  const resource = options.resource ?? 'all';
  const includeDisabled = options.includeDisabled ?? false;
  const controlPath = getCodexProjectConfigPath(projectDir, config);
  const entries: CodexContextEntry[] = [];

  if (matchesResource(resource, 'agents')) {
    entries.push(...await scanAgentEntries(projectDir, resolvedHome, config, controlPath));
  }

  if (matchesResource(resource, 'skill')) {
    entries.push(...await scanSkillEntries(projectDir, resolvedHome, config, controlPath, includeDisabled));
  }

  if (matchesResource(resource, 'plugin')) {
    const pluginEntries = await scanPluginEntries(projectDir, resolvedHome, config, controlPath, includeDisabled);
    entries.push(...(options.discoverMcpTools === false ? pluginEntries : await discoverMcpToolsForMixedEntries(pluginEntries)));
  }

  if (matchesResource(resource, 'mcp')) {
    const mcpEntries = scanMcpEntries(projectDir, resolvedHome, config, controlPath, includeDisabled);
    entries.push(...(options.discoverMcpTools === false ? mcpEntries : await discoverMcpToolsForServers(mcpEntries)));
  }

  if (matchesResource(resource, 'memory')) {
    entries.push(...scanMemoryEntries(projectDir, resolvedHome, config, controlPath, includeDisabled));
  }

  return entries.filter((entry) => includeDisabled || getEntryEnabled(entry) !== false);
}

function matchesResource(filter: CodexResourceFilter, resource: Exclude<CodexResourceFilter, 'all'>): boolean {
  return filter === 'all' || filter === resource;
}

async function scanAgentEntries(
  projectDir: string,
  homeDir: string,
  config: CodexContextConfig,
  controlPath: string,
): Promise<ContextResourceRecord[]> {
  const candidates = expandAgentsCandidates(projectDir, homeDir, config)
    .filter((entry) => entry.enabled !== false)
    .filter((entry) => existsSync(entry.resolvedPath));

  const selected = applyAgentsOverridePrecedence(candidates);
  const limit = config.officialLimits.projectDocMaxBytes;
  let usedBytes = 0;
  const results: ContextResourceRecord[] = [];

  for (const entry of selected) {
    const raw = readText(entry.resolvedPath);
    if (!raw?.trim()) continue;
    const remaining = Math.max(0, limit - usedBytes);
    if (remaining <= 0) break;
    const truncated = raw.slice(0, remaining);
    usedBytes += Buffer.byteLength(truncated, 'utf8');
    results.push({
      id: `codex:agents:${entry.id}`,
      source: 'agents',
      name: basename(entry.resolvedPath),
      sourcePath: entry.resolvedPath,
      platform: 'codex',
      scope: entry.scope,
      resource: 'agents',
      kind: 'agents-chain',
      text: truncated,
      activation: 'always-on',
      budgetScope: 'always-on',
      confidence: 'high',
      enabled: true,
      configSource: entry.configSource,
      controllable: false,
      controlPath,
      controlMethod: 'unsupported',
      estimateStatus: 'estimated',
      officialLimit: {
        kind: 'chars',
        value: config.officialLimits.projectDocMaxBytes,
        appliesTo: 'combined AGENTS.md instruction chain',
      },
      recommendation: 'AGENTS.md cannot be safely toggled by project config in v1; simplify it, move rare guidance into a skill, or manually rename the file.',
    });
  }

  return results;
}

async function scanSkillEntries(
  projectDir: string,
  homeDir: string,
  config: CodexContextConfig,
  controlPath: string,
  includeDisabled: boolean,
): Promise<SkillRecord[]> {
  const disabledSkills = readDisabledSkillSelectors(projectDir, homeDir);
  const results: SkillRecord[] = [];

  for (const dirEntry of config.skillDirs.filter((entry) => entry.enabled !== false)) {
    const dir = resolveCodexPath(dirEntry.path, projectDir, homeDir);
    for (const skillPath of findSkillFiles(dir)) {
      const skill = await parseSkill(toSkillFile(skillPath, dirEntry.scope, dirEntry.path));
      if (!skill) continue;
      const enabled = !matchesDisabledSkill(skill, skillPath, disabledSkills);
      if (!enabled && !includeDisabled) continue;
      results.push({
        ...skill,
        id: `codex:skill:${skillPath}`,
        context: {
          resource: 'skill',
          configSource: dirEntry.configSource,
          enabled,
          controllable: true,
          controlPath,
          controlMethod: 'skills.config',
          estimateStatus: 'estimated',
        },
      });
    }
  }

  return results;
}

async function scanPluginEntries(
  projectDir: string,
  homeDir: string,
  config: CodexContextConfig,
  controlPath: string,
  includeDisabled: boolean,
): Promise<Array<SkillRecord | McpServerRecord>> {
  const pluginStates = readPluginEnabledStates(projectDir, homeDir);
  const results: Array<SkillRecord | McpServerRecord> = [];

  for (const dirEntry of config.pluginDirs.filter((entry) => entry.enabled !== false)) {
    for (const manifestPath of expandCodexGlob(dirEntry.manifestGlob, projectDir, homeDir)) {
      const manifest = readJsonObject(manifestPath);
      const pluginName = stringValue(manifest?.name) ?? basename(dirname(dirname(manifestPath)));
      const pluginId = findPluginConfigId(pluginName, pluginStates) ?? pluginName;
      const enabled = pluginStates.get(pluginId) ?? pluginStates.get(pluginName) ?? true;
      if (!enabled && !includeDisabled) continue;

      const skillsDir = resolvePluginSkillsDir(manifestPath, manifest, dirEntry.skillsField, dirEntry.defaultSkillsDir);
      for (const skillPath of findSkillFiles(skillsDir)) {
        const skill = await parseSkill(toSkillFile(skillPath, dirEntry.scope, dirEntry.id));
        if (!skill) continue;
        results.push({
          ...skill,
          id: `codex:plugin:${pluginId}:skill:${skill.name}`,
          context: {
            resource: 'plugin',
            configSource: dirEntry.configSource,
            enabled,
            controllable: true,
            controlPath,
            controlMethod: `plugins.${pluginId}.enabled`,
            estimateStatus: 'estimated',
          },
        });
      }

      const mcpConfigPath = resolvePluginMcpConfigPath(manifestPath, manifest);
      if (mcpConfigPath) {
        const pluginRoot = dirname(dirname(manifestPath));
        const mcpServers = scanMcpServers(projectDir, {
          files: [{
            platform: 'codex',
            scope: dirEntry.scope,
            path: mcpConfigPath,
            format: 'json',
            baseDir: pluginRoot,
          }],
          includeDisabled,
        });

        for (const server of mcpServers) {
          results.push({
            ...server,
            id: `codex:plugin:${pluginId}:mcp:${server.name}`,
            context: {
              resource: 'plugin',
              configSource: manifestPath,
              enabled: enabled && server.enabled !== false,
              controllable: true,
              controlPath,
              controlMethod: `plugins.${pluginId}.enabled`,
              estimateStatus: server.toolDiscoveryStatus === 'failed' ? 'unknown' : 'estimated',
            },
          });
        }
      }
    }
  }

  return results;
}

function scanMcpEntries(
  projectDir: string,
  homeDir: string,
  config: CodexContextConfig,
  controlPath: string,
  includeDisabled: boolean,
): McpServerRecord[] {
  const files: McpConfigFile[] = config.mcpConfigFiles
    .filter((entry) => entry.enabled !== false)
    .map((entry) => ({
      platform: 'codex' as const,
      scope: entry.scope,
      path: resolveCodexPath(entry.path, projectDir, homeDir),
      format: 'toml' as const,
    }));

  return scanMcpServers(projectDir, { files, includeDisabled }).map((server) => ({
    ...server,
    id: `codex:mcp:${server.name}`,
    context: {
      resource: 'mcp',
      configSource: config.mcpConfigFiles.find((entry) => resolveCodexPath(entry.path, projectDir, homeDir) === server.sourcePath)?.configSource,
      enabled: server.enabled !== false,
      controllable: true,
      controlPath,
      controlMethod: `mcp_servers.${server.name}.enabled`,
      estimateStatus: server.toolDiscoveryStatus === 'failed' ? 'unknown' : 'estimated',
    },
  }));
}

function scanMemoryEntries(
  projectDir: string,
  homeDir: string,
  config: CodexContextConfig,
  controlPath: string,
  includeDisabled: boolean,
): ContextResourceRecord[] {
  const configState = readMemoryEnabledState(projectDir, homeDir);
  const enabled = configState ?? true;
  if (!enabled && !includeDisabled) return [];

  return config.memoryLocations
    .filter((entry) => entry.enabled !== false)
    .flatMap((entry) => expandCodexGlob(entry.path, projectDir, homeDir).map((path) => ({
      source: 'memory' as const,
      id: `codex:memory:${entry.id}:${path}`,
      name: basename(path),
      sourcePath: path,
      platform: 'codex' as const,
      scope: entry.scope,
      resource: 'memory' as const,
      kind: 'memory-context-unknown' as const,
      text: '',
      activation: 'startup' as const,
      budgetScope: 'startup-selection' as const,
      confidence: 'low' as const,
      enabled,
      configSource: entry.configSource,
      controllable: false,
      controlPath,
      controlMethod: 'unsupported',
      estimateStatus: 'unknown' as const,
      recommendation: 'Codex memories can affect future sessions; disable memories in Codex settings/config if this context is not wanted.',
    })));
}

function expandAgentsCandidates(
  projectDir: string,
  homeDir: string,
  config: CodexContextConfig,
): Array<CodexContextConfig['agentsFiles'][number] & { resolvedPath: string; chainOrder: number }> {
  const projectChain = buildProjectDirectoryChain(projectDir, homeDir);
  const candidates: Array<CodexContextConfig['agentsFiles'][number] & { resolvedPath: string; chainOrder: number }> = [];

  for (const entry of config.agentsFiles) {
    if (entry.scope !== 'project') {
      candidates.push({ ...entry, resolvedPath: resolveCodexPath(entry.path, projectDir, homeDir), chainOrder: -1 });
      continue;
    }

    const basePath = resolveCodexPath(entry.path, projectDir, homeDir);
    const relativePath = relative(projectDir, basePath);
    if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
      candidates.push({ ...entry, resolvedPath: basePath, chainOrder: projectChain.length });
      continue;
    }

    projectChain.forEach((dir, chainOrder) => {
      candidates.push({
        ...entry,
        id: chainOrder === projectChain.length - 1 ? entry.id : `${entry.id}:${relative(dir, projectDir) || basename(dir)}`,
        resolvedPath: resolve(dir, relativePath),
        chainOrder,
      });
    });
  }

  return candidates;
}

function buildProjectDirectoryChain(projectDir: string, homeDir: string): string[] {
  const resolvedProject = resolve(projectDir);
  const resolvedHome = homeDir ? resolve(homeDir) : '';
  const root = parse(resolvedProject).root;
  const chain: string[] = [];
  let current = resolvedProject;

  while (current && current !== root && current !== resolvedHome) {
    chain.unshift(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return chain.length > 0 ? chain : [resolvedProject];
}

function applyAgentsOverridePrecedence<T extends { resolvedPath: string; priority?: number; scope: Scope; chainOrder?: number }>(entries: T[]): T[] {
  const byDir = new Map<string, T>();
  for (const entry of [...entries].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))) {
    const key = `${entry.scope}:${dirname(entry.resolvedPath)}`;
    if (!byDir.has(key)) byDir.set(key, entry);
  }
  return [...byDir.values()].sort((left, right) => {
    if (left.scope !== right.scope) return left.scope === 'global' ? -1 : 1;
    if ((left.chainOrder ?? 0) !== (right.chainOrder ?? 0)) return (left.chainOrder ?? 0) - (right.chainOrder ?? 0);
    return left.resolvedPath.localeCompare(right.resolvedPath);
  });
}

function findSkillFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const results: string[] = [];
  const visit = (dir: string, depth: number) => {
    if (depth > 4) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORED_SKILL_DIRS.has(entry)) continue;
      const path = join(dir, entry);
      let stats;
      try {
        stats = statSync(path);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        visit(path, depth + 1);
      } else if (entry === 'SKILL.md') {
        results.push(path);
      }
    }
  };
  visit(root, 0);
  return results.sort();
}

function toSkillFile(filePath: string, scope: Scope, installSource: string): SkillFile {
  return {
    filePath,
    platform: 'codex',
    scope,
    confidence: 'high',
    installSource,
  };
}

function readDisabledSkillSelectors(projectDir: string, homeDir: string): Array<{ path?: string; name?: string }> {
  const selectors: Array<{ path?: string; name?: string }> = [];
  for (const path of codexStateConfigPaths(projectDir, homeDir)) {
    const raw = readText(path);
    if (!raw) continue;
    const blocks = raw.split(/(?=^\[\[skills\.config\]\])/gm).filter((block) => block.startsWith('[[skills.config]]'));
    for (const block of blocks) {
      if (!/^\s*enabled\s*=\s*false\s*$/m.test(block)) continue;
      const selector: { path?: string; name?: string } = {};
      const pathMatch = block.match(/^\s*path\s*=\s*(['"])(.*?)\1\s*$/m);
      const nameMatch = block.match(/^\s*name\s*=\s*(['"])(.*?)\1\s*$/m);
      if (pathMatch?.[2]) selector.path = resolveCodexPath(pathMatch[2], projectDir, homeDir);
      if (nameMatch?.[2]) selector.name = nameMatch[2];
      selectors.push(selector);
    }
  }
  return selectors;
}

function matchesDisabledSkill(skill: SkillRecord, skillPath: string, selectors: Array<{ path?: string; name?: string }>): boolean {
  return selectors.some((selector) =>
    (selector.path && selector.path === skillPath) ||
    (selector.name && selector.name === skill.name)
  );
}

function readPluginEnabledStates(projectDir: string, homeDir: string): Map<string, boolean> {
  const states = new Map<string, boolean>();
  for (const path of codexStateConfigPaths(projectDir, homeDir)) {
    const raw = readText(path);
    if (!raw) continue;
    for (const match of raw.matchAll(/^\[plugins\.(?:"([^"]+)"|([^\]]+))\]\s*$(?<body>[\s\S]*?)(?=^\[|$(?![\s\S]))/gm)) {
      const id = match[1] ?? match[2];
      const body = match.groups?.body ?? '';
      const enabled = body.match(/^\s*enabled\s*=\s*(true|false)\s*$/m)?.[1];
      if (id && enabled) states.set(id.trim(), enabled === 'true');
    }
  }
  return states;
}

function readMemoryEnabledState(projectDir: string, homeDir: string): boolean | undefined {
  let state: boolean | undefined;
  for (const path of codexStateConfigPaths(projectDir, homeDir)) {
    const raw = readText(path);
    if (!raw) continue;
    const features = readTomlTable(raw, 'features');
    const memories = readTomlTable(raw, 'memories');
    const featureEnabled = features.match(/^\s*memories\s*=\s*(true|false)\s*$/m)?.[1];
    const useMemories = memories.match(/^\s*use_memories\s*=\s*(true|false)\s*$/m)?.[1];
    if (featureEnabled) state = featureEnabled === 'true';
    if (useMemories) state = useMemories === 'true';
  }
  return state;
}

function codexStateConfigPaths(projectDir: string, homeDir: string): string[] {
  return [
    '~/.codex/config.toml',
    '~/.agent/config.toml',
    '~/.agents/config.toml',
    '.codex/config.toml',
  ].map((path) => resolveCodexPath(path, projectDir, homeDir));
}

function readTomlTable(raw: string, name: string): string {
  const match = raw.match(new RegExp(`^\\[${escapeRegex(name)}\\]\\s*$([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))`, 'm'));
  return match?.[1] ?? '';
}

function findPluginConfigId(pluginName: string, states: Map<string, boolean>): string | undefined {
  if (states.has(pluginName)) return pluginName;
  return [...states.keys()].find((key) => key === pluginName || key.startsWith(`${pluginName}@`));
}

function resolvePluginSkillsDir(
  manifestPath: string,
  manifest: Record<string, unknown> | null,
  skillsField = 'skills',
  defaultSkillsDir = 'skills',
): string {
  const pluginRoot = dirname(dirname(manifestPath));
  const rawSkillsDir = stringValue(manifest?.[skillsField]) ?? defaultSkillsDir;
  return join(pluginRoot, rawSkillsDir);
}

function resolvePluginMcpConfigPath(
  manifestPath: string,
  manifest: Record<string, unknown> | null,
): string | null {
  const pluginRoot = dirname(dirname(manifestPath));
  const rawMcpServers = manifest?.mcpServers ?? manifest?.mcp_servers;
  const mcpConfigPath = stringValue(rawMcpServers);
  if (!mcpConfigPath) return null;
  return resolve(pluginRoot, mcpConfigPath);
}

async function discoverMcpToolsForMixedEntries<T extends SkillRecord | McpServerRecord>(entries: T[]): Promise<T[]> {
  const discovered = await discoverMcpToolsForServers(
    entries.filter((entry): entry is Extract<T, McpServerRecord> => isMcpServerRecord(entry) && entry.context?.enabled !== false),
  );
  const byIdOrName = new Map(discovered.map((server) => [server.id ?? server.name, server]));
  return entries.map((entry) => {
    if (!isMcpServerRecord(entry)) return entry;
    return (byIdOrName.get(entry.id ?? entry.name) ?? entry) as T;
  });
}

function isMcpServerRecord(entry: SkillRecord | McpServerRecord): entry is McpServerRecord {
  return 'source' in entry && entry.source === 'mcp';
}

function getEntryEnabled(entry: CodexContextEntry): boolean | undefined {
  if ('context' in entry) return entry.context?.enabled;
  if ('enabled' in entry) return entry.enabled;
  return undefined;
}

function readText(path: string): string | null {
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function readJsonObject(path: string): Record<string, unknown> | null {
  const raw = readText(path);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
