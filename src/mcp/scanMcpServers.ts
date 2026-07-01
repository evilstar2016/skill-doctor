import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

import type { McpServerRecord } from '../types/mcp';
import type { Platform, Scope } from '../types/skill';

interface ScanMcpServersOptions {
  homeDir?: string;
}

type JsonObject = Record<string, unknown>;

export interface McpConfigFile {
  platform: Platform;
  scope: Scope;
  path: string;
  format: 'json' | 'toml';
}

export function scanMcpServers(projectDir: string, options: ScanMcpServersOptions = {}): McpServerRecord[] {
  const homeDir = options.homeDir ?? homedir();
  const files: McpConfigFile[] = [
    { platform: 'codex', scope: 'global', path: join(homeDir, '.codex', 'config.toml'), format: 'toml' },
    { platform: 'codex', scope: 'project', path: join(projectDir, '.codex', 'config.toml'), format: 'toml' },
    { platform: 'claude', scope: 'global', path: join(homeDir, '.claude.json'), format: 'json' },
    { platform: 'claude', scope: 'project', path: join(projectDir, '.mcp.json'), format: 'json' },
    { platform: 'gemini', scope: 'global', path: join(homeDir, '.gemini', 'settings.json'), format: 'json' },
    { platform: 'gemini', scope: 'project', path: join(projectDir, '.gemini', 'settings.json'), format: 'json' },
    { platform: 'cursor', scope: 'global', path: join(homeDir, '.cursor', 'mcp.json'), format: 'json' },
    { platform: 'cursor', scope: 'project', path: join(projectDir, '.cursor', 'mcp.json'), format: 'json' },
  ];

  return files.flatMap((file) => readConfigFile(file, projectDir));
}

function readConfigFile(file: McpConfigFile, projectDir: string): McpServerRecord[] {
  if (!existsSync(file.path)) return [];

  let raw: string;
  try {
    raw = readFileSync(file.path, 'utf8');
  } catch {
    return [];
  }

  try {
    if (file.format === 'toml') {
      return parseCodexToml(raw, file);
    }

    const parsed = JSON.parse(raw) as unknown;
    return parseJsonMcpConfig(parsed, file, projectDir);
  } catch {
    return [];
  }
}

export function parseCodexToml(raw: string, file: McpConfigFile): McpServerRecord[] {
  const servers = new Map<string, JsonObject>();
  let currentServer: string | null = null;
  let currentSubtable: string | null = null;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;

    const table = line.match(/^\[([^\]]+)\]$/);
    if (table) {
      const parts = table[1].split('.');
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
    .filter(([, config]) => !isDisabled(config))
    .map(([name, config]) => normalizeMcpServer(name, config, file));
}

function parseJsonMcpConfig(parsed: unknown, file: McpConfigFile, projectDir: string): McpServerRecord[] {
  if (!isObject(parsed)) return [];

  const configs: Array<{ servers: unknown; baseConfig?: JsonObject; scope: Scope }> = [];
  if (isObject(parsed.mcpServers)) {
    configs.push({ servers: parsed.mcpServers, baseConfig: getGlobalMcpConfig(parsed), scope: file.scope });
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
      .filter(([, config]) => isObject(config) && !isDisabled(config))
      .map(([name, config]) => normalizeMcpServer(name, mergeMcpConfig(config as JsonObject, baseConfig), { ...file, scope }));
  });
}

function normalizeMcpServer(name: string, config: JsonObject, file: McpConfigFile): McpServerRecord {
  const headers = firstObject(config.headers, config.header, config.requestHeaders);
  const env = firstObject(config.env, config.environment);
  const allowlist = firstStringArray(
    config.allowedTools,
    config.allowed_tools,
    config.toolAllowlist,
    config.tool_allowlist,
    config.includeTools,
    config.include_tools,
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

  return {
    source: 'mcp',
    name,
    sourcePath: file.path,
    platform: file.platform,
    scope: file.scope,
    ...(stringValue(config.transport ?? config.type) ? { transport: stringValue(config.transport ?? config.type) } : {}),
    ...(stringValue(config.command) ? { command: stringValue(config.command) } : {}),
    args: firstStringArray(config.args, config.arguments),
    ...(stringValue(config.url ?? config.endpoint) ? { url: stringValue(config.url ?? config.endpoint) } : {}),
    envKeys: Object.keys(env).sort(),
    headerKeys: Object.keys(headers).sort(),
    toolAllowlist: allowlist,
    toolDenylist: denylist,
    ...(stringValue(config.approvalMode ?? config.approval_mode) ? { approvalMode: stringValue(config.approvalMode ?? config.approval_mode) } : {}),
    ...(typeof config.trusted === 'boolean' ? { trusted: config.trusted } : {}),
    ...(numberValue(config.timeout ?? config.timeoutMs ?? config.timeout_ms) ? { timeoutMs: numberValue(config.timeout ?? config.timeoutMs ?? config.timeout_ms) } : {}),
  };
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
