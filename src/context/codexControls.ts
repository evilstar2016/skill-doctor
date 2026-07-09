import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { getCodexProjectConfigPath, loadCodexContextConfig } from './codexContextConfig';
import { scanCodexContextEntries } from './scanCodexContext';

export interface ToggleCodexResourceOptions {
  configPath?: string;
  homeDir?: string;
}

export interface ToggleCodexResourceResult {
  id: string;
  name: string;
  resource: string;
  configPath: string;
  enabled?: boolean;
  supported: boolean;
  changed: boolean;
  requiresNewSession: boolean;
  message: string;
  recommendation?: string;
}

export async function toggleCodexResource(
  projectDir: string,
  id: string,
  enabled: boolean,
  options: ToggleCodexResourceOptions = {},
): Promise<ToggleCodexResourceResult> {
  const entries = await scanCodexContextEntries(projectDir, {
    homeDir: options.homeDir,
    configPath: options.configPath,
    includeDisabled: true,
    discoverMcpTools: false,
  });
  const loaded = loadCodexContextConfig({ homeDir: options.homeDir, projectDir, configPath: options.configPath });
  const configPath = getCodexProjectConfigPath(projectDir, loaded.config);
  const mcpTool = parseMcpToolId(id);
  const entry = mcpTool
    ? entries.find((candidate) => getEntryId(candidate) === mcpTool.serverId)
    : entries.find((candidate) => getEntryId(candidate) === id);

  if (!entry) {
    throw new Error(`Codex resource not found: ${id}`);
  }

  const context = 'context' in entry ? entry.context : undefined;
  if (context?.controllable === false || getEntryResource(entry) === 'agents' || getEntryResource(entry) === 'memory') {
    return {
      id,
      name: entry.name,
      resource: getEntryResource(entry) ?? 'unknown',
      configPath,
      supported: false,
      changed: false,
      requiresNewSession: false,
      message: `Codex resource cannot be toggled automatically: ${id}`,
      recommendation: getUnsupportedRecommendation(getEntryResource(entry), entry),
    };
  }

  const resource = getEntryResource(entry);
  let changed = false;

  if (mcpTool) {
    if (resource !== 'mcp') {
      throw new Error(`Codex MCP tool resource cannot be toggled automatically: ${id}`);
    }
    changed = upsertMcpToolConfig(configPath, entry.name, mcpTool.toolName, enabled, {
      allowlist: 'toolAllowlist' in entry ? entry.toolAllowlist : [],
      denylist: 'toolDenylist' in entry ? entry.toolDenylist : [],
    });
  } else if (resource === 'skill') {
    changed = upsertSkillConfig(configPath, entry.sourcePath, enabled);
  } else if (resource === 'plugin') {
    const pluginId = parsePluginId(id);
    if (!pluginId) throw new Error(`Cannot resolve plugin id for resource: ${id}`);
    changed = upsertTableBoolean(configPath, `plugins.${quoteTomlKey(pluginId)}`, 'enabled', enabled);
  } else if (resource === 'mcp') {
    changed = upsertTableBoolean(configPath, `mcp_servers.${quoteBareOrTomlKey(entry.name)}`, 'enabled', enabled);
  } else {
    throw new Error(`Codex resource cannot be toggled automatically: ${id}`);
  }

  return {
    id,
    name: entry.name,
    resource: mcpTool ? 'mcp-tool' : resource ?? 'unknown',
    enabled,
    configPath,
    supported: true,
    changed,
    requiresNewSession: true,
    message: 'Config updated. Start a new Codex session or restart Codex for this change to take effect.',
  };
}

function upsertSkillConfig(configPath: string, skillPath: string, enabled: boolean): boolean {
  const raw = readConfig(configPath);
  const blocks = raw.split(/(?=^\[\[skills\.config\]\])/gm);
  let updated = false;
  const next = blocks.map((block) => {
    if (!block.startsWith('[[skills.config]]')) return block;
    const pathMatch = block.match(/^\s*path\s*=\s*(['"])(.*?)\1\s*$/m);
    if (pathMatch?.[2] !== skillPath) return block;
    updated = true;
    return upsertScalarInBlock(block, 'enabled', String(enabled));
  }).join('');

  if (updated) {
    return writeConfig(configPath, next);
  }

  return writeConfig(
    configPath,
    appendBlock(raw, ['[[skills.config]]', `path = ${quoteTomlString(skillPath)}`, `enabled = ${enabled}`].join('\n')),
  );
}

function upsertTableBoolean(configPath: string, tableName: string, key: string, value: boolean): boolean {
  const raw = readConfig(configPath);
  const match = findTomlTable(raw, tableName);

  if (!match) {
    return writeConfig(configPath, appendBlock(raw, [`[${tableName}]`, `${key} = ${value}`].join('\n')));
  }

  const block = match[0];
  const updated = upsertScalarInBlock(block, key, String(value));
  return writeConfig(configPath, raw.slice(0, match.index) + updated + raw.slice((match.index ?? 0) + block.length));
}

function upsertMcpToolConfig(
  configPath: string,
  serverName: string,
  toolName: string,
  enabled: boolean,
  lists: { allowlist: string[]; denylist: string[] },
): boolean {
  const tableName = `mcp_servers.${quoteBareOrTomlKey(serverName)}`;
  const raw = readConfig(configPath);
  const match = findTomlTable(raw, tableName);
  const existingBlock = match?.[0] ?? `[${tableName}]\n`;
  const disabledBase = readTomlStringArray(existingBlock, 'disabled_tools') ?? lists.denylist;
  const disabledTools = enabled ? removeUnique(disabledBase, toolName) : addUnique(disabledBase, toolName);
  let updatedBlock = upsertTomlStringArray(existingBlock, 'disabled_tools', disabledTools);

  if (enabled && lists.allowlist.length > 0) {
    const enabledBase = readTomlStringArray(existingBlock, 'enabled_tools') ?? lists.allowlist;
    updatedBlock = upsertTomlStringArray(updatedBlock, 'enabled_tools', addUnique(enabledBase, toolName));
  }

  if (!match) {
    return writeConfig(configPath, appendBlock(raw, updatedBlock.trimEnd()));
  }

  return writeConfig(configPath, raw.slice(0, match.index) + updatedBlock + raw.slice((match.index ?? 0) + existingBlock.length));
}

function upsertScalarInBlock(block: string, key: string, value: string): string {
  const keyPattern = new RegExp(`^\\s*${escapeRegex(key)}\\s*=.*$`, 'm');
  if (keyPattern.test(block)) {
    return block.replace(keyPattern, `${key} = ${value}`);
  }
  return `${block.trimEnd()}\n${key} = ${value}\n`;
}

function appendBlock(raw: string, block: string): string {
  return `${raw.trimEnd()}${raw.trim() ? '\n\n' : ''}${block}\n`;
}

function readConfig(configPath: string): string {
  if (!existsSync(configPath)) return '';
  return readFileSync(configPath, 'utf8');
}

function writeConfig(configPath: string, content: string): boolean {
  const previous = readConfig(configPath);
  if (previous === content) return false;
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, content, 'utf8');
  return true;
}

function getEntryId(entry: { id?: string }): string | undefined {
  return entry.id;
}

function getEntryResource(entry: { context?: { resource?: string }; resource?: string }): string | undefined {
  return entry.context?.resource ?? entry.resource;
}

function parsePluginId(id: string): string | null {
  if (!id.startsWith('codex:plugin:')) return null;
  const rest = id.slice('codex:plugin:'.length);
  const skillIndex = rest.indexOf(':skill:');
  const mcpIndex = rest.indexOf(':mcp:');
  const indexes = [skillIndex, mcpIndex].filter((index) => index >= 0);
  const end = indexes.length > 0 ? Math.min(...indexes) : rest.indexOf(':');
  return end > 0 ? rest.slice(0, end) : null;
}

function parseMcpToolId(id: string): { serverId: string; toolName: string } | null {
  if (!id.startsWith('codex:mcp:')) return null;
  const toolMarker = ':tool:';
  const toolIndex = id.indexOf(toolMarker);
  if (toolIndex < 0) return null;
  const serverName = id.slice('codex:mcp:'.length, toolIndex);
  const toolName = id.slice(toolIndex + toolMarker.length);
  if (!serverName || !toolName) return null;
  return { serverId: `codex:mcp:${serverName}`, toolName };
}

function quoteBareOrTomlKey(value: string): string {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : quoteTomlKey(value);
}

function quoteTomlKey(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function quoteTomlString(value: string): string {
  return quoteTomlKey(value);
}

function findTomlTable(raw: string, tableName: string): RegExpMatchArray | null {
  const escaped = escapeRegex(tableName);
  const tablePattern = new RegExp(`^\\[${escaped}\\]\\s*$([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))`, 'm');
  return raw.match(tablePattern);
}

function upsertTomlStringArray(block: string, key: string, values: string[]): string {
  return upsertScalarInBlock(block, key, `[${values.map((value) => quoteTomlString(value)).join(', ')}]`);
}

function readTomlStringArray(block: string, key: string): string[] | null {
  const match = block.match(new RegExp(`^\\s*${escapeRegex(key)}\\s*=\\s*\\[(.*?)\\]\\s*$`, 'm'));
  if (!match) return null;
  const values: string[] = [];
  for (const item of match[1].matchAll(/(['"])((?:\\.|(?!\1).)*)\1/g)) {
    values.push(item[2].replace(/\\(["\\])/g, '$1'));
  }
  return values;
}

function addUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
}

function removeUnique(values: string[], value: string): string[] {
  return values.filter((candidate) => candidate !== value);
}

function getUnsupportedRecommendation(resource: string | undefined, entry: { recommendation?: string }): string | undefined {
  if (resource === 'agents') {
    return entry.recommendation ?? 'Simplify AGENTS.md, move rare guidance into a skill, or manually rename the file.';
  }
  if (resource === 'memory') {
    return entry.recommendation ?? 'Disable Codex memories in Codex settings/config if this context is not wanted.';
  }
  return undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
