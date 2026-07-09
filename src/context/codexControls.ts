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
  enabled: boolean;
  configPath: string;
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
  const entry = entries.find((candidate) => getEntryId(candidate) === id);

  if (!entry) {
    throw new Error(`Codex resource not found: ${id}`);
  }

  const context = 'context' in entry ? entry.context : undefined;
  if (context?.controllable === false || getEntryResource(entry) === 'agents' || getEntryResource(entry) === 'memory') {
    throw new Error(`Codex resource cannot be toggled automatically: ${id}`);
  }

  const loaded = loadCodexContextConfig({ homeDir: options.homeDir, projectDir, configPath: options.configPath });
  const configPath = getCodexProjectConfigPath(projectDir, loaded.config);
  const resource = getEntryResource(entry);

  if (resource === 'skill') {
    upsertSkillConfig(configPath, entry.sourcePath, enabled);
  } else if (resource === 'plugin') {
    const pluginId = parsePluginId(id);
    if (!pluginId) throw new Error(`Cannot resolve plugin id for resource: ${id}`);
    upsertTableBoolean(configPath, `plugins.${quoteTomlKey(pluginId)}`, 'enabled', enabled);
  } else if (resource === 'mcp') {
    upsertTableBoolean(configPath, `mcp_servers.${quoteBareOrTomlKey(entry.name)}`, 'enabled', enabled);
  } else {
    throw new Error(`Codex resource cannot be toggled automatically: ${id}`);
  }

  return {
    id,
    name: entry.name,
    resource: resource ?? 'unknown',
    enabled,
    configPath,
  };
}

function upsertSkillConfig(configPath: string, skillPath: string, enabled: boolean): void {
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
    writeConfig(configPath, next);
    return;
  }

  writeConfig(
    configPath,
    appendBlock(raw, ['[[skills.config]]', `path = ${quoteTomlString(skillPath)}`, `enabled = ${enabled}`].join('\n')),
  );
}

function upsertTableBoolean(configPath: string, tableName: string, key: string, value: boolean): void {
  const raw = readConfig(configPath);
  const escaped = escapeRegex(tableName);
  const tablePattern = new RegExp(`^\\[${escaped}\\]\\s*$([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))`, 'm');
  const match = raw.match(tablePattern);

  if (!match) {
    writeConfig(configPath, appendBlock(raw, [`[${tableName}]`, `${key} = ${value}`].join('\n')));
    return;
  }

  const block = match[0];
  const updated = upsertScalarInBlock(block, key, String(value));
  writeConfig(configPath, raw.slice(0, match.index) + updated + raw.slice((match.index ?? 0) + block.length));
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

function writeConfig(configPath: string, content: string): void {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, content, 'utf8');
}

function getEntryId(entry: { id?: string }): string | undefined {
  return entry.id;
}

function getEntryResource(entry: { context?: { resource?: string }; resource?: string }): string | undefined {
  return entry.context?.resource ?? entry.resource;
}

function parsePluginId(id: string): string | null {
  const match = id.match(/^codex:plugin:([^:]+):/);
  return match?.[1] ?? null;
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
