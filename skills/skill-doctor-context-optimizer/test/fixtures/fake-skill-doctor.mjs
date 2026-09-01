#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const statePath = process.env.FAKE_SKILL_DOCTOR_STATE;
if (!statePath) throw new Error('FAKE_SKILL_DOCTOR_STATE is required');

const args = process.argv.slice(2);
if (args[0] === '--version') {
  process.stdout.write('0.5.0\n');
  process.exit(0);
}

const state = JSON.parse(readFileSync(statePath, 'utf8'));
state.log ??= [];

function save() {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function flag(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function pluginId(id) {
  if (!id.startsWith('codex:plugin:')) return null;
  const rest = id.slice('codex:plugin:'.length);
  const indexes = [rest.indexOf(':skill:'), rest.indexOf(':mcp:')].filter((value) => value >= 0);
  return indexes.length > 0 ? rest.slice(0, Math.min(...indexes)) : null;
}

function aggregate(resource, items, enabled) {
  const members = items.filter((item) => item.enabled === enabled);
  if (members.length === 0) return null;
  const estimatedChars = Math.min(8000, members.reduce((sum, item) => sum + item.estimatedChars, 0));
  return {
    id: `codex:${resource}-list:${enabled ? 'enabled' : 'disabled'}`,
    name: resource === 'skill' ? 'Codex skill list' : 'Codex plugin skill list',
    sourcePath: '/fake/home',
    platform: 'codex',
    scope: 'global',
    resource,
    kind: resource === 'skill' ? 'codex-skill-list' : 'plugin-skill-list',
    estimatedTokens: Math.round(estimatedChars / 4),
    estimatedChars,
    activationEstimatedTokens: Math.round(estimatedChars / 4),
    budgetScope: 'startup-selection',
    enabled,
    controllable: true,
    controlMethod: resource === 'skill' ? 'skills.config' : 'plugins.<id>.enabled',
    estimateStatus: 'estimated',
    officialLimit: { kind: 'chars', value: 8000 },
    recommendation: 'OK',
  };
}

function contextPayload(resource) {
  const resourceItems = state.items.filter((item) => item.resource === resource);
  const active = resourceItems.filter((item) => item.enabled !== false);
  const disabled = resourceItems.filter((item) => item.enabled === false);
  const activeAggregate = ['skill', 'plugin'].includes(resource)
    ? aggregate(resource, resourceItems, true)
    : null;
  const disabledAggregate = ['skill', 'plugin'].includes(resource)
    ? aggregate(resource, resourceItems, false)
    : null;
  const listMember = (item) => item.kind === 'agent-skill-description'
    && ['skill', 'plugin'].includes(item.resource);
  const fixed = active.reduce(
    (sum, item) => sum + (listMember(item) ? 0 : item.estimatedTokens),
    activeAggregate?.estimatedTokens ?? 0,
  );
  const disabledFixed = disabled.reduce(
    (sum, item) => sum + (listMember(item) ? 0 : item.estimatedTokens),
    disabledAggregate?.estimatedTokens ?? 0,
  );
  const activation = active.reduce(
    (sum, item) => sum + item.activationEstimatedTokens,
    activeAggregate?.activationEstimatedTokens ?? 0,
  );
  return {
    summary: {
      totalEstimatedTokens: fixed,
      disabledEstimatedTokens: disabledFixed,
      byPlatform: active.length > 0 ? [{
        platform: 'codex',
        startupSelectionTokens: fixed,
        alwaysOnTokens: 0,
        activationTokens: activation,
      }] : [],
    },
    items: activeAggregate ? [activeAggregate, ...active] : active,
    disabledItems: disabledAggregate ? [disabledAggregate, ...disabled] : disabled,
  };
}

if (args[0] === 'context' && ['enable', 'disable'].includes(args[1])) {
  const action = args[1];
  const id = flag('--id');
  state.log.push({ command: action, id });
  if (action === 'disable' && state.failOnDisable === id) {
    save();
    process.stderr.write(`simulated failure: ${id}\n`);
    process.exit(1);
  }

  const plugin = pluginId(id);
  let candidates;
  if (plugin) {
    candidates = state.items.filter((item) => pluginId(item.id) === plugin);
  } else if (id.startsWith('codex:mcp:') && !id.includes(':tool:')) {
    candidates = state.items.filter((item) => item.id === id || item.id.startsWith(`${id}:tool:`));
  } else {
    candidates = state.items.filter((item) => item.id === id);
  }
  if (candidates.length === 0) {
    process.stderr.write(`resource not found: ${id}\n`);
    process.exit(1);
  }

  const enabled = action === 'enable';
  const changed = candidates.some((item) => item.enabled !== enabled);
  for (const item of candidates) item.enabled = enabled;
  save();
  process.stdout.write(`${JSON.stringify({
    id,
    name: candidates[0].name,
    supported: true,
    changed,
    enabled,
    configPath: '/fake/project/.codex/config.toml',
    requiresNewSession: true,
  })}\n`);
  process.exit(0);
}

if (args[0] === 'context') {
  const resource = flag('--resource');
  state.log.push({ command: 'context', resource });
  save();
  process.stdout.write(`${JSON.stringify(contextPayload(resource), null, 2)}\n`);
  process.exit(0);
}

process.stderr.write(`unsupported fake invocation: ${args.join(' ')}\n`);
process.exit(1);
