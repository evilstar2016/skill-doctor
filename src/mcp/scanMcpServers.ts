import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

import { getPlatformAdapters, resolvePlatformPathTemplate } from '../platforms/registry';
import type { McpServerRecord } from '../types/mcp';
import type { Platform, Scope } from '../types/skill';

interface ScanMcpServersOptions {
  homeDir?: string;
  appDataDir?: string;
  files?: McpConfigFile[];
  includeDisabled?: boolean;
}

type JsonObject = Record<string, unknown>;
type PrivateMcpConfig = { env: Record<string, string>; headers: Record<string, string>; cwd?: string };

const PRIVATE_CONFIG = new WeakMap<McpServerRecord, PrivateMcpConfig>();
const CONFIG_KEYS = new WeakMap<McpServerRecord, Set<string>>();

export interface McpConfigFile {
  platform: Platform;
  scope: Scope;
  path: string;
  format: 'json' | 'toml';
  baseDir?: string;
}

export function scanMcpServers(projectDir: string, options: ScanMcpServersOptions = {}): McpServerRecord[] {
  const homeDir = options.homeDir ?? homedir();
  const appDataDir = options.appDataDir ?? (process.env['APPDATA'] ?? join(homeDir, 'AppData', 'Roaming'));
  const files = options.files ?? resolveMcpConfigFiles(projectDir, homeDir, appDataDir);

  return files.flatMap((file) => readConfigFile(file, projectDir, { includeDisabled: options.includeDisabled ?? false }));
}

function resolveMcpConfigFiles(projectDir: string, homeDir: string, appDataDir: string): McpConfigFile[] {
  return getPlatformAdapters().flatMap((adapter) =>
    adapter.mcpConfigFiles.map((source) => ({
      platform: adapter.platform,
      scope: source.scope,
      path: source.scope === 'global'
        ? resolvePlatformPathTemplate(source.path, homeDir, appDataDir)
        : join(projectDir, source.path),
      format: source.format,
    })),
  );
}

function readConfigFile(file: McpConfigFile, projectDir: string, options: { includeDisabled: boolean }): McpServerRecord[] {
  if (!existsSync(file.path)) return [];

  let raw: string;
  try {
    raw = readFileSync(file.path, 'utf8');
  } catch {
    return [];
  }

  try {
    if (file.format === 'toml') {
      return parseCodexToml(raw, file, options);
    }

    const parsed = JSON.parse(raw) as unknown;
    return parseJsonMcpConfig(parsed, file, projectDir, options);
  } catch {
    return [];
  }
}

export function parseCodexToml(raw: string, file: McpConfigFile, options: { includeDisabled?: boolean } = {}): McpServerRecord[] {
  const servers = new Map<string, JsonObject>();
  let currentServer: string | null = null;
  let currentSubtable: string | null = null;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;

    const arrayTable = line.match(/^\[\[([^\]]+)\]\]$/);
    if (arrayTable) {
      currentServer = null;
      currentSubtable = null;
      continue;
    }

    const table = line.match(/^\[([^\]]+)\]$/);
    if (table) {
      const parts = splitTomlPath(table[1]);
      if (parts[0] === 'mcp_servers' && parts[1]) {
        currentServer = unquoteTomlKey(parts[1]);
        currentSubtable = parts[2] ? unquoteTomlKey(parts[2]) : null;
        servers.set(currentServer, servers.get(currentServer) ?? {});
      } else {
        currentServer = null;
        currentSubtable = null;
      }
      continue;
    }

    if (!currentServer) continue;

    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const value = parseTomlValue(line.slice(separator + 1).trim());
    const server = servers.get(currentServer) ?? {};
    servers.set(currentServer, server);

    if (currentSubtable) {
      const nested = isObject(server[currentSubtable]) ? server[currentSubtable] as JsonObject : {};
      nested[key] = value;
      server[currentSubtable] = nested;
    } else {
      server[key] = value;
    }
  }

  return [...servers.entries()]
    .filter(([, config]) => options.includeDisabled || !isDisabled(config))
    .map(([name, config]) => normalizeMcpServer(name, config, file));
}

function parseJsonMcpConfig(
  parsed: unknown,
  file: McpConfigFile,
  projectDir: string,
  options: { includeDisabled: boolean },
): McpServerRecord[] {
  if (!isObject(parsed)) return [];

  const configs: Array<{ servers: unknown; baseConfig?: JsonObject; scope: Scope }> = [];
  const servers = isObject(parsed.mcpServers) ? parsed.mcpServers : parsed.servers;
  if (isObject(servers)) {
    configs.push({ servers, baseConfig: getGlobalMcpConfig(parsed), scope: file.scope });
  }

  if (file.platform === 'claude' && file.scope === 'global' && isObject(parsed.projects)) {
    const projectKeys = getProjectKeys(projectDir);
    for (const key of projectKeys) {
      const projectConfig = parsed.projects[key];
      if (isObject(projectConfig) && isObject(projectConfig.mcpServers)) {
        configs.push({ servers: projectConfig.mcpServers, baseConfig: getGlobalMcpConfig(projectConfig), scope: 'project' });
      }
    }
  }

  return configs.flatMap(({ servers, baseConfig, scope }) => {
    if (!isObject(servers)) return [];
    return Object.entries(servers)
      .filter(([, config]) => isObject(config) && (options.includeDisabled || !isDisabled(config)))
      .map(([name, config]) => normalizeMcpServer(name, mergeMcpConfig(config as JsonObject, baseConfig), { ...file, scope }));
  });
}

function normalizeMcpServer(name: string, config: JsonObject, file: McpConfigFile): McpServerRecord {
  const headers = firstObject(config.headers, config.header, config.requestHeaders);
  const env = firstObject(config.env, config.environment);
  const bearerTokenEnvVar = stringValue(config.bearer_token_env_var ?? config.bearerTokenEnvVar);
  const cwd = resolveWorkingDir(stringValue(config.cwd ?? config.workingDirectory ?? config.working_dir), file);
  const allowlist = firstStringArray(
    config.allowedTools,
    config.allowed_tools,
    config.enabledTools,
    config.enabled_tools,
    config.toolAllowlist,
    config.tool_allowlist,
    config.includeTools,
    config.include_tools,
    config.tools,
    config.allowed,
  );
  const denylist = firstStringArray(
    config.disabledTools,
    config.disabled_tools,
    config.excludedTools,
    config.excluded_tools,
    config.toolDenylist,
    config.tool_denylist,
    config.excludeTools,
    config.exclude_tools,
    config.excluded,
  );

  const record: McpServerRecord = {
    source: 'mcp',
    name,
    sourcePath: file.path,
    platform: file.platform,
    scope: file.scope,
    enabled: !isDisabled(config),
    ...(stringValue(config.instructions) ? { instructions: stringValue(config.instructions) } : {}),
    ...(stringValue(config.transport ?? config.type) ? { transport: stringValue(config.transport ?? config.type) } : {}),
    ...(stringValue(config.command) ? { command: stringValue(config.command) } : {}),
    args: firstStringArray(config.args, config.arguments),
    ...(stringValue(config.url ?? config.endpoint) ? { url: stringValue(config.url ?? config.endpoint) } : {}),
    envKeys: [...new Set([...Object.keys(env), ...(bearerTokenEnvVar ? [bearerTokenEnvVar] : [])])].sort(),
    headerKeys: Object.keys(headers).sort(),
    toolAllowlist: allowlist,
    toolDenylist: denylist,
    ...(stringValue(config.approvalMode ?? config.approval_mode ?? config.default_tools_approval_mode) ? { approvalMode: stringValue(config.approvalMode ?? config.approval_mode ?? config.default_tools_approval_mode) } : {}),
    ...(typeof config.trusted === 'boolean' ? { trusted: config.trusted } : {}),
    ...(numberValue(config.timeout ?? config.timeoutMs ?? config.timeout_ms ?? config.tool_timeout_sec ?? config.startup_timeout_sec) ? { timeoutMs: numberValue(config.timeout ?? config.timeoutMs ?? config.timeout_ms ?? config.tool_timeout_sec ?? config.startup_timeout_sec) } : {}),
  };
  PRIVATE_CONFIG.set(record, {
    env: stringRecord(env),
    headers: stringRecord(headers),
    ...(cwd ? { cwd } : {}),
  });
  CONFIG_KEYS.set(record, new Set(Object.keys(config)));
  return record;
}

export function getMcpPrivateConfig(server: McpServerRecord): PrivateMcpConfig {
  return PRIVATE_CONFIG.get(server) ?? { env: {}, headers: {} };
}

export function applyMcpServerOverride(base: McpServerRecord, override: McpServerRecord): McpServerRecord {
  const keys = CONFIG_KEYS.get(override) ?? new Set<string>();
  const has = (...names: string[]) => names.some((name) => keys.has(name));

  if (has('enabled', 'disabled')) base.enabled = override.enabled;
  if (has('instructions')) base.instructions = override.instructions;
  if (has('transport', 'type')) base.transport = override.transport;
  if (has('command')) base.command = override.command;
  if (has('args', 'arguments')) base.args = override.args;
  if (has('url', 'endpoint')) base.url = override.url;
  if (has('allowedTools', 'allowed_tools', 'enabledTools', 'enabled_tools', 'toolAllowlist', 'tool_allowlist', 'includeTools', 'include_tools', 'tools', 'allowed')) {
    base.toolAllowlist = override.toolAllowlist;
  }
  if (has('disabledTools', 'disabled_tools', 'excludedTools', 'excluded_tools', 'toolDenylist', 'tool_denylist', 'excludeTools', 'exclude_tools', 'excluded')) {
    base.toolDenylist = override.toolDenylist;
  }
  if (has('approvalMode', 'approval_mode', 'default_tools_approval_mode')) base.approvalMode = override.approvalMode;
  if (has('trusted')) base.trusted = override.trusted;
  if (has('timeout', 'timeoutMs', 'timeout_ms', 'tool_timeout_sec', 'startup_timeout_sec')) base.timeoutMs = override.timeoutMs;

  const basePrivate = getMcpPrivateConfig(base);
  const overridePrivate = getMcpPrivateConfig(override);
  if (has('env', 'environment', 'bearer_token_env_var')) {
    base.envKeys = override.envKeys;
    PRIVATE_CONFIG.set(base, { ...basePrivate, env: overridePrivate.env });
  }
  if (has('headers', 'header', 'requestHeaders')) {
    base.headerKeys = override.headerKeys;
    PRIVATE_CONFIG.set(base, { ...getMcpPrivateConfig(base), headers: overridePrivate.headers });
  }
  if (has('cwd', 'workingDirectory', 'working_dir')) {
    PRIVATE_CONFIG.set(base, { ...getMcpPrivateConfig(base), ...(overridePrivate.cwd ? { cwd: overridePrivate.cwd } : {}) });
  }

  base.scope = override.scope;
  base.sourcePath = override.sourcePath;
  return base;
}

function resolveWorkingDir(cwd: string | undefined, file: McpConfigFile): string | undefined {
  if (!cwd) return undefined;
  if (isAbsolute(cwd)) return cwd;
  return resolve(file.baseDir ?? dirname(file.path), cwd);
}

function mergeMcpConfig(config: JsonObject, baseConfig?: JsonObject): JsonObject {
  if (!baseConfig) return config;
  return {
    ...config,
    allowed: config.allowed ?? baseConfig.allowed,
    excluded: config.excluded ?? baseConfig.excluded,
  };
}

function getGlobalMcpConfig(config: JsonObject): JsonObject | undefined {
  return isObject(config.mcp) ? config.mcp : undefined;
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

function isDisabled(config: unknown): boolean {
  if (!isObject(config)) return false;
  return config.disabled === true || config.enabled === false;
}

function firstObject(...values: unknown[]): JsonObject {
  for (const value of values) {
    if (isObject(value)) return value;
  }
  return {};
}

function firstStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    const strings = stringArray(value);
    if (strings.length > 0) return strings;
  }
  return [];
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item)).filter((item): item is string => Boolean(item));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringRecord(value: JsonObject): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    const resolved = stringValue(raw);
    if (resolved) result[key] = resolved;
  }
  return result;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripTomlComment(line: string): string {
  let inString = false;
  let quote = '';
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === '"' || char === "'") && line[index - 1] !== '\\') {
      if (!inString) {
        inString = true;
        quote = char;
      } else if (quote === char) {
        inString = false;
        quote = '';
      }
    }
    if (char === '#' && !inString) {
      return line.slice(0, index);
    }
  }
  return line;
}

function parseTomlValue(raw: string): unknown {
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return [];
    return splitTomlArray(inner).map((item) => parseTomlValue(item.trim()));
  }

  if (raw === 'true') return true;
  if (raw === 'false') return false;

  const number = Number(raw);
  if (Number.isFinite(number) && raw !== '') return number;

  return stripTomlString(raw);
}

function splitTomlArray(inner: string): string[] {
  const values: string[] = [];
  let current = '';
  let inString = false;
  let quote = '';

  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    if ((char === '"' || char === "'") && inner[index - 1] !== '\\') {
      if (!inString) {
        inString = true;
        quote = char;
      } else if (quote === char) {
        inString = false;
        quote = '';
      }
    }

    if (char === ',' && !inString) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  if (current) values.push(current);
  return values;
}

function stripTomlString(raw: string): string {
  const trimmed = raw.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return trimmed;
}

function unquoteTomlKey(key: string): string {
  return stripTomlString(key.trim());
}

function splitTomlPath(raw: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inString = false;
  let quote = '';

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if ((char === '"' || char === "'") && raw[index - 1] !== '\\') {
      if (!inString) {
        inString = true;
        quote = char;
      } else if (quote === char) {
        inString = false;
        quote = '';
      }
    }

    if (char === '.' && !inString) {
      parts.push(unquoteTomlKey(current));
      current = '';
      continue;
    }

    current += char;
  }

  if (current) parts.push(unquoteTomlKey(current));
  return parts;
}
