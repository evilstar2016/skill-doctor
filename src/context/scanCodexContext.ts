import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from 'node:path';

import { discoverMcpToolsForServers } from '../mcp/listMcpTools';
import { applyMcpServerOverride, scanMcpServers, type McpConfigFile } from '../mcp/scanMcpServers';
import { parseSkill } from '../parsing/parseSkill';
import type { ContextResourceRecord } from '../types/context';
import type { McpServerRecord } from '../types/mcp';
import type { Scope, SkillFile, SkillRecord } from '../types/skill';
import type { EffectiveScanSource } from '../config/scanSources';
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
  discoverMcpToolsForServers?: (servers: McpServerRecord[]) => Promise<McpServerRecord[]>;
  scanSources?: EffectiveScanSource[];
}

export type CodexContextEntry = SkillRecord | McpServerRecord | ContextResourceRecord;

const IGNORED_SKILL_DIRS = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', 'coverage']);

interface CodexSkillSelector {
  path?: string;
  name?: string;
  enabled: boolean;
}

interface CodexEffectiveState {
  skillSelectors: CodexSkillSelector[];
  pluginEnabled: Map<string, boolean>;
  memoriesEnabled?: boolean;
}

export async function scanCodexContextEntries(
  projectDir: string,
  options: ScanCodexContextOptions = {},
): Promise<CodexContextEntry[]> {
  const loaded = loadCodexContextConfig({ homeDir: options.homeDir, projectDir, configPath: options.configPath });
  const config = options.scanSources ? applyConfiguredScanSources(loaded.config, options.scanSources) : loaded.config;
  const homeDir = options.homeDir ?? process.env.HOME ?? process.env.USERPROFILE;
  const resolvedHome = homeDir ?? '';
  const resource = options.resource ?? 'all';
  const includeDisabled = options.includeDisabled ?? false;
  const discoverTools = options.discoverMcpToolsForServers ?? discoverMcpToolsForServers;
  const controlPath = getCodexProjectConfigPath(projectDir, config);
  const effectiveState = loadCodexEffectiveState(projectDir, resolvedHome);
  const entries: CodexContextEntry[] = [];

  if (matchesResource(resource, 'agents')) {
    entries.push(...await scanAgentEntries(projectDir, resolvedHome, config, controlPath));
  }

  if (matchesResource(resource, 'skill')) {
    entries.push(...await scanSkillEntries(projectDir, resolvedHome, config, controlPath, effectiveState));
  }

  if (matchesResource(resource, 'plugin')) {
    const pluginEntries = await scanPluginEntries(projectDir, resolvedHome, config, controlPath, effectiveState, includeDisabled);
    entries.push(...(options.discoverMcpTools === false ? pluginEntries : await discoverMcpToolsForMixedEntries(pluginEntries, discoverTools)));
  }

  if (matchesResource(resource, 'mcp')) {
    const mcpEntries = scanMcpEntries(projectDir, resolvedHome, config, controlPath, includeDisabled);
    entries.push(...(options.discoverMcpTools === false ? mcpEntries : await discoverMcpToolsForMixedEntries(mcpEntries, discoverTools)));
  }

  if (matchesResource(resource, 'memory')) {
    entries.push(...scanMemoryEntries(projectDir, resolvedHome, config, controlPath, includeDisabled, effectiveState));
  }

  return entries.filter((entry) => includeDisabled || getEntryEnabled(entry) !== false);
}

function applyConfiguredScanSources(config: CodexContextConfig, sources: EffectiveScanSource[]): CodexContextConfig {
  const codex = sources.filter((entry) => entry.platform === 'codex');
  return {
    ...config,
    skillDirs: codex.filter((entry) => entry.resource === 'skill').map((entry) => ({
      id: entry.id, scope: entry.scope, path: entry.path, enabled: entry.enabled,
      configSource: entry.origin === 'builtin' ? 'builtin:scan-sources' : 'user:scan-sources',
    })),
    mcpConfigFiles: codex.filter((entry) => entry.resource === 'mcp').map((entry) => ({
      id: entry.id, scope: entry.scope, path: entry.path, format: entry.format ?? 'toml', enabled: entry.enabled,
      configSource: entry.origin === 'builtin' ? 'builtin:scan-sources' : 'user:scan-sources',
    })),
    pluginDirs: codex.filter((entry) => entry.resource === 'plugin').map((entry) => ({
      id: entry.id, scope: entry.scope, manifestGlob: entry.path, enabled: entry.enabled,
      skillsField: entry.skillsField, defaultSkillsDir: entry.defaultSkillsDir,
      configSource: entry.origin === 'builtin' ? 'builtin:scan-sources' : 'user:scan-sources',
    })),
  };
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
  effectiveState: CodexEffectiveState,
): Promise<SkillRecord[]> {
  const candidates: Array<{ skill: SkillRecord; skillPath: string; dirEntry: CodexContextConfig['skillDirs'][number] }> = [];

  for (const dirEntry of config.skillDirs.filter((entry) => entry.enabled !== false)) {
    const dir = resolveCodexPath(dirEntry.path, projectDir, homeDir);
    for (const skillPath of findSkillFiles(dir)) {
      const skill = await parseSkill(toSkillFile(skillPath, dirEntry.scope, dirEntry.path));
      if (!skill) continue;
      candidates.push({ skill, skillPath, dirEntry });
    }
  }

  return candidates.map(({ skill, skillPath, dirEntry }) => {
      const enabled = isSkillEnabled(skill, skillPath, effectiveState.skillSelectors);
      return {
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
      };
    });
}

async function scanPluginEntries(
  projectDir: string,
  homeDir: string,
  config: CodexContextConfig,
  controlPath: string,
  effectiveState: CodexEffectiveState,
  includeDisabled: boolean,
): Promise<Array<SkillRecord | McpServerRecord>> {
  const pluginStates = effectiveState.pluginEnabled;
  const skillCandidates: Array<{
    skill: SkillRecord;
    skillPath: string;
    dirEntry: CodexContextConfig['pluginDirs'][number];
    pluginName: string;
    pluginId: string;
    pluginEnabled: boolean;
  }> = [];
  const results: Array<SkillRecord | McpServerRecord> = [];

  for (const dirEntry of config.pluginDirs.filter((entry) => entry.enabled !== false)) {
    for (const manifestPath of expandCodexGlob(dirEntry.manifestGlob, projectDir, homeDir)) {
      const manifest = readJsonObject(manifestPath);
      const pluginName = stringValue(manifest?.name) ?? basename(dirname(dirname(manifestPath)));
      const pluginId = findPluginConfigId(pluginName, pluginStates) ?? pluginName;
      const enabled = pluginStates.get(pluginId) ?? pluginStates.get(pluginName) ?? true;

      const skillsDir = resolvePluginSkillsDir(manifestPath, manifest, dirEntry.skillsField, dirEntry.defaultSkillsDir);
      for (const skillPath of findSkillFiles(skillsDir)) {
        const skill = await parseSkill(toSkillFile(skillPath, dirEntry.scope, dirEntry.id));
        if (!skill) continue;
        skillCandidates.push({
          skill,
          skillPath,
          dirEntry,
          pluginName,
          pluginId,
          pluginEnabled: enabled,
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

  for (const candidate of skillCandidates) {
    const skillEnabled = candidate.pluginEnabled && isSkillEnabled(
      candidate.skill,
      candidate.skillPath,
      effectiveState.skillSelectors,
      [`${candidate.pluginName}:${candidate.skill.name}`, `${candidate.pluginId}:${candidate.skill.name}`],
    );
    results.push({
      ...candidate.skill,
      id: `codex:plugin:${candidate.pluginId}:skill:${candidate.skill.name}`,
      context: {
        resource: 'plugin',
        configSource: candidate.dirEntry.configSource,
        enabled: skillEnabled,
        controllable: true,
        controlPath,
        controlMethod: `plugins.${candidate.pluginId}.enabled`,
        estimateStatus: 'estimated',
      },
    });
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
    .flatMap((entry) => {
      const baseDirs = entry.scope === 'project' && !isAbsolute(entry.path) && !entry.path.startsWith('~')
        ? buildProjectDirectoryChain(projectDir)
        : [projectDir];
      return baseDirs.map((baseDir) => ({
        platform: 'codex' as const,
        scope: entry.scope,
        path: resolveCodexPath(entry.path, baseDir, homeDir),
        format: entry.format,
      }));
    });

  const servers = mergeCodexMcpServerOverrides(scanMcpServers(projectDir, { files, includeDisabled: true }));

  return servers
    .filter((server) => includeDisabled || server.enabled !== false)
    .map((server) => {
      server.id = `codex:mcp:${server.name}`;
      server.context = {
        resource: 'mcp',
        configSource: config.mcpConfigFiles.find((entry) => entry.scope === server.scope)?.configSource,
        enabled: server.enabled !== false,
        controllable: true,
        controlPath,
        controlMethod: `mcp_servers.${server.name}.enabled`,
        estimateStatus: server.toolDiscoveryStatus === 'failed' ? 'unknown' : 'estimated',
      };
      return server;
    });
}

function mergeCodexMcpServerOverrides(servers: McpServerRecord[]): McpServerRecord[] {
  const effective = new Map<string, McpServerRecord>();

  for (const server of servers.filter((candidate) => candidate.scope === 'global')) {
    effective.set(server.name, server);
  }

  for (const projectServer of servers.filter((candidate) => candidate.scope === 'project')) {
    const globalServer = effective.get(projectServer.name);
    if (!globalServer) {
      effective.set(projectServer.name, projectServer);
      continue;
    }

    effective.set(projectServer.name, applyMcpServerOverride(globalServer, projectServer));
  }

  return [...effective.values()];
}

function scanMemoryEntries(
  projectDir: string,
  homeDir: string,
  config: CodexContextConfig,
  controlPath: string,
  includeDisabled: boolean,
  effectiveState: CodexEffectiveState,
): ContextResourceRecord[] {
  const configState = effectiveState.memoriesEnabled;
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
  const projectChain = buildProjectDirectoryChain(projectDir);
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

function buildProjectDirectoryChain(projectDir: string): string[] {
  const resolvedProject = resolve(projectDir);
  const projectRoot = findGitProjectRoot(resolvedProject);
  if (!projectRoot) return [resolvedProject];

  const chain: string[] = [];
  let current = resolvedProject;

  while (true) {
    chain.unshift(current);
    if (current === projectRoot) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return chain.length > 0 ? chain : [resolvedProject];
}

function findGitProjectRoot(projectDir: string): string | null {
  let current = projectDir;
  const filesystemRoot = parse(projectDir).root;

  while (true) {
    if (existsSync(join(current, '.git'))) return current;
    if (current === filesystemRoot) return null;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
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

function loadCodexEffectiveState(projectDir: string, homeDir: string): CodexEffectiveState {
  const skillSelectors: CodexSkillSelector[] = [];
  const pluginEnabled = new Map<string, boolean>();
  let memoriesEnabled: boolean | undefined;

  for (const configPath of codexStateConfigPaths(projectDir, homeDir)) {
    const raw = readText(configPath);
    if (!raw) continue;

    const blocks = raw.split(/(?=^\[\[skills\.config\]\])/gm).filter((block) => block.startsWith('[[skills.config]]'));
    for (const block of blocks) {
      const enabled = block.match(/^\s*enabled\s*=\s*(true|false)\s*$/m)?.[1];
      if (!enabled) continue;
      const selector: { path?: string; name?: string } = {};
      const pathMatch = block.match(/^\s*path\s*=\s*(['"])(.*?)\1\s*$/m);
      const nameMatch = block.match(/^\s*name\s*=\s*(['"])(.*?)\1\s*$/m);
      if (pathMatch?.[2]) selector.path = resolveCodexPath(pathMatch[2], dirname(configPath), homeDir);
      if (nameMatch?.[2]) selector.name = nameMatch[2];
      if (!selector.path && !selector.name) continue;
      skillSelectors.push({ ...selector, enabled: enabled === 'true' });
    }

    for (const match of raw.matchAll(/^\[plugins\.(?:"([^"]+)"|([^\]]+))\]\s*$(?<body>[\s\S]*?)(?=^\[|$(?![\s\S]))/gm)) {
      const id = match[1] ?? match[2];
      const body = match.groups?.body ?? '';
      const enabled = body.match(/^\s*enabled\s*=\s*(true|false)\s*$/m)?.[1];
      if (id && enabled) pluginEnabled.set(id.trim(), enabled === 'true');
    }

    const features = readTomlTable(raw, 'features');
    const memories = readTomlTable(raw, 'memories');
    const featureEnabled = features.match(/^\s*memories\s*=\s*(true|false)\s*$/m)?.[1];
    const useMemories = memories.match(/^\s*use_memories\s*=\s*(true|false)\s*$/m)?.[1];
    if (featureEnabled) memoriesEnabled = featureEnabled === 'true';
    if (useMemories) memoriesEnabled = useMemories === 'true';
  }

  return { skillSelectors, pluginEnabled, ...(memoriesEnabled === undefined ? {} : { memoriesEnabled }) };
}

function isSkillEnabled(
  skill: SkillRecord,
  skillPath: string,
  selectors: CodexSkillSelector[],
  alternateNames: string[] = [],
): boolean {
  const names = new Set([skill.name, ...alternateNames]);
  let enabled = true;
  for (const selector of selectors) {
    if ((selector.path && sameResolvedPath(selector.path, skillPath)) || (selector.name && names.has(selector.name))) {
      enabled = selector.enabled;
    }
  }
  return enabled;
}

function sameResolvedPath(left: string, right: string): boolean {
  return resolveExistingPath(left) === resolveExistingPath(right);
}

function resolveExistingPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function codexStateConfigPaths(projectDir: string, homeDir: string): string[] {
  return [
    '~/.codex/config.toml',
    '~/.agent/config.toml',
    '~/.agents/config.toml',
  ].map((path) => resolveCodexPath(path, projectDir, homeDir)).concat(
    buildProjectDirectoryChain(projectDir).map((dir) => join(dir, '.codex', 'config.toml')),
  );
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

async function discoverMcpToolsForMixedEntries<T extends SkillRecord | McpServerRecord>(
  entries: T[],
  discoverTools: (servers: McpServerRecord[]) => Promise<McpServerRecord[]>,
): Promise<T[]> {
  const discovered = await discoverTools(
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
