#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const schemaVersion = 1;
const aggregateKinds = new Set(['codex-skill-list', 'plugin-skill-list']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class OptimizerError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'OptimizerError';
    this.details = details;
  }
}

function usage() {
  return [
    'Usage:',
    '  context-optimizer.mjs snapshot [--project DIR] [--platform PLATFORM] [--scope project|global|all] [--include-mcp]',
    '  context-optimizer.mjs preview --snapshot ID --disable RESOURCE_ID [--disable RESOURCE_ID ...]',
    '  context-optimizer.mjs apply --plan ID --confirm DIGEST',
    '  context-optimizer.mjs undo --operation ID',
  ].join('\n');
}

function parseArguments(argv) {
  const [command = 'help', ...args] = argv;
  const options = { disable: [] };
  const valueFlags = new Map([
    ['--project', 'project'],
    ['--platform', 'platform'],
    ['--scope', 'scope'],
    ['--snapshot', 'snapshot'],
    ['--disable', 'disable'],
    ['--plan', 'plan'],
    ['--confirm', 'confirm'],
    ['--operation', 'operation'],
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--include-mcp') {
      options.includeMcp = true;
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }

    const key = valueFlags.get(argument);
    if (!key) throw new OptimizerError(`Unknown option: ${argument}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new OptimizerError(`Missing value for ${argument}`);
    }
    index += 1;
    if (key === 'disable') options.disable.push(value);
    else options[key] = value;
  }

  return { command, options };
}

function stateRoot() {
  return resolve(
    process.env.SKILL_DOCTOR_OPTIMIZER_HOME
      ?? join(homedir(), '.skill-doctor', 'context-optimizer'),
  );
}

function assertStateId(value, label) {
  if (!value || !uuidPattern.test(value)) {
    throw new OptimizerError(`Invalid ${label}: ${value ?? '(missing)'}`);
  }
  return value;
}

function statePath(collection, id) {
  return join(stateRoot(), collection, `${assertStateId(id, collection)}.json`);
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, path);
}

async function saveState(collection, value) {
  await writeJsonAtomic(statePath(collection, value.id), value);
}

async function loadState(collection, id) {
  const path = statePath(collection, id);
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new OptimizerError(`${collection} record not found: ${id}`);
    }
    if (error instanceof SyntaxError) {
      throw new OptimizerError(`${collection} record is invalid JSON: ${id}`);
    }
    throw error;
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  );
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

async function runSkillDoctor(args, cwd) {
  const executable = process.env.SKILL_DOCTOR_BIN || 'skill-doctor';
  try {
    const { stdout } = await execFileAsync(executable, args, {
      cwd,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (error) {
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
    const reason = stderr || error?.message || String(error);
    throw new OptimizerError(`skill-doctor failed: ${reason}`, { args });
  }
}

async function runSkillDoctorJson(args, cwd) {
  const output = await runSkillDoctor(args, cwd);
  try {
    return JSON.parse(output);
  } catch {
    throw new OptimizerError('skill-doctor returned invalid JSON', {
      args,
      output: output.slice(0, 500),
    });
  }
}

async function resolveProjectDir(value) {
  const projectDir = resolve(value || process.cwd());
  let projectStat;
  try {
    projectStat = await stat(projectDir);
  } catch {
    throw new OptimizerError(`Project directory does not exist: ${projectDir}`);
  }
  if (!projectStat.isDirectory()) {
    throw new OptimizerError(`Project path is not a directory: ${projectDir}`);
  }
  return projectDir;
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function isAggregate(item) {
  return aggregateKinds.has(item.kind);
}

function selectionBlock(item) {
  if (!item.id) return 'missing-resource-id';
  if (item.enabled === false) return 'already-disabled';
  if (isAggregate(item)) return 'aggregate-estimate-only';
  if (item.controllable !== true) return 'not-project-controllable';
  if (item.estimateStatus === 'unsupported') return 'unsupported';
  return null;
}

function normalizeItem(raw, enabledFallback, resourceFallback) {
  const item = {
    id: typeof raw?.id === 'string' ? raw.id : null,
    name: typeof raw?.name === 'string' ? raw.name : '(unnamed)',
    sourcePath: typeof raw?.sourcePath === 'string' ? raw.sourcePath : '',
    platform: typeof raw?.platform === 'string' ? raw.platform : 'unknown',
    scope: typeof raw?.scope === 'string' ? raw.scope : 'unknown',
    resource: typeof raw?.resource === 'string' ? raw.resource : resourceFallback,
    kind: typeof raw?.kind === 'string' ? raw.kind : 'unknown',
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : enabledFallback,
    controllable: raw?.controllable === true,
    controlMethod: typeof raw?.controlMethod === 'string' ? raw.controlMethod : null,
    controlPath: typeof raw?.controlPath === 'string' ? raw.controlPath : null,
    estimateStatus: typeof raw?.estimateStatus === 'string' ? raw.estimateStatus : 'estimated',
    estimatedTokens: numberOrZero(raw?.estimatedTokens),
    estimatedChars: numberOrZero(raw?.estimatedChars),
    activationEstimatedTokens: numberOrZero(raw?.activationEstimatedTokens),
    budgetScope: typeof raw?.budgetScope === 'string' ? raw.budgetScope : 'none',
    recommendation: typeof raw?.recommendation === 'string' ? raw.recommendation : '',
    officialLimit: raw?.officialLimit && typeof raw.officialLimit === 'object'
      ? raw.officialLimit
      : null,
  };
  const blockedBy = selectionBlock(item);
  return { ...item, selectable: blockedBy === null, selectionBlock: blockedBy };
}

function combineSummary(results, items) {
  const platformSummaries = results.flatMap((result) =>
    Array.isArray(result?.summary?.byPlatform) ? result.summary.byPlatform : [],
  );
  return {
    totalEstimatedTokens: results.reduce(
      (sum, result) => sum + numberOrZero(result?.summary?.totalEstimatedTokens),
      0,
    ),
    disabledEstimatedTokens: results.reduce(
      (sum, result) => sum + numberOrZero(result?.summary?.disabledEstimatedTokens),
      0,
    ),
    startupSelectionTokens: platformSummaries.reduce(
      (sum, summary) => sum + numberOrZero(summary?.startupSelectionTokens),
      0,
    ),
    alwaysOnTokens: platformSummaries.reduce(
      (sum, summary) => sum + numberOrZero(summary?.alwaysOnTokens),
      0,
    ),
    activationTokens: platformSummaries.reduce(
      (sum, summary) => sum + numberOrZero(summary?.activationTokens),
      0,
    ),
    resources: items.filter((item) => !isAggregate(item)).length,
    enabledResources: items.filter((item) => item.enabled !== false && !isAggregate(item)).length,
    selectableResources: items.filter((item) => item.selectable).length,
  };
}

function inventoryFingerprint(items) {
  return digest(
    items
      .filter((item) => item.id)
      .map((item) => ({
        id: item.id,
        enabled: item.enabled,
        controllable: item.controllable,
        controlMethod: item.controlMethod,
        estimateStatus: item.estimateStatus,
        estimatedTokens: item.estimatedTokens,
        estimatedChars: item.estimatedChars,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  );
}

async function collectSnapshot({ projectDir, platform, scope, includeMcp }) {
  const version = await runSkillDoctor(['--version'], projectDir);
  const resources = platform === 'codex' ? ['skill', 'plugin'] : ['skill'];
  if (includeMcp) resources.push('mcp');

  const results = [];
  const itemMap = new Map();
  for (const resource of resources) {
    const result = await runSkillDoctorJson([
      'context',
      projectDir,
      '--platform',
      platform,
      '--scope',
      scope,
      '--resource',
      resource,
      '--show-disable',
      '--json',
    ], projectDir);
    if (!result?.summary || !Array.isArray(result.items)) {
      throw new OptimizerError(`Unexpected context payload for resource: ${resource}`);
    }
    results.push(result);

    for (const [rawItems, enabled] of [
      [result.items, true],
      [Array.isArray(result.disabledItems) ? result.disabledItems : [], false],
    ]) {
      for (const raw of rawItems) {
        const item = normalizeItem(raw, enabled, resource);
        const key = item.id || `${item.resource}:${item.kind}:${item.sourcePath}:${item.enabled}`;
        itemMap.set(key, item);
      }
    }
  }

  const items = [...itemMap.values()].sort((left, right) => {
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
    return `${left.resource}:${left.name}:${left.id}`.localeCompare(
      `${right.resource}:${right.name}:${right.id}`,
    );
  });
  const snapshot = {
    schemaVersion,
    kind: 'skill-doctor-context-snapshot',
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    skillDoctorVersion: version,
    projectDir,
    platform,
    scope,
    coverage: {
      resources,
      mcpRuntimeDiscovery: includeMcp,
    },
    summary: combineSummary(results, items),
    inventoryFingerprint: inventoryFingerprint(items),
    items,
  };
  return snapshot;
}

function parsePluginId(id) {
  if (!id?.startsWith('codex:plugin:')) return null;
  const rest = id.slice('codex:plugin:'.length);
  const markers = [':skill:', ':mcp:'];
  const indexes = markers.map((marker) => rest.indexOf(marker)).filter((index) => index >= 0);
  if (indexes.length === 0) return null;
  return rest.slice(0, Math.min(...indexes)) || null;
}

function parseMcpId(id) {
  if (!id?.startsWith('codex:mcp:')) return null;
  const toolMarker = ':tool:';
  const toolIndex = id.indexOf(toolMarker);
  if (toolIndex === -1) return { serverId: id, tool: null };
  return {
    serverId: id.slice(0, toolIndex),
    tool: id.slice(toolIndex + toolMarker.length),
  };
}

function operationUnit(item) {
  const pluginId = parsePluginId(item.id);
  if (pluginId) {
    return { key: `plugin:${pluginId}`, type: 'plugin', groupId: pluginId };
  }
  const mcp = parseMcpId(item.id);
  if (mcp?.tool) {
    return { key: `mcp-tool:${item.id}`, type: 'mcp-tool', groupId: item.id, serverId: mcp.serverId };
  }
  if (mcp) {
    return { key: `mcp-server:${mcp.serverId}`, type: 'mcp-server', groupId: mcp.serverId };
  }
  return { key: `resource:${item.id}`, type: item.resource, groupId: item.id };
}

function buildOperations(items, selectedItems) {
  const units = new Map();
  for (const item of selectedItems) {
    const unit = operationUnit(item);
    const existing = units.get(unit.key);
    if (existing) existing.requestedIds.push(item.id);
    else units.set(unit.key, { ...unit, id: item.id, requestedIds: [item.id] });
  }

  const selectedServers = new Set(
    [...units.values()].filter((unit) => unit.type === 'mcp-server').map((unit) => unit.groupId),
  );
  const activeItems = items.filter((item) => item.enabled !== false && !isAggregate(item));
  return [...units.values()]
    .filter((unit) => unit.type !== 'mcp-tool' || !selectedServers.has(unit.serverId))
    .map((unit) => {
      let affectedItems;
      if (unit.type === 'plugin') {
        affectedItems = activeItems.filter((item) => parsePluginId(item.id) === unit.groupId);
      } else if (unit.type === 'mcp-server') {
        affectedItems = activeItems.filter((item) => {
          const mcp = parseMcpId(item.id);
          return mcp?.serverId === unit.groupId;
        });
      } else {
        affectedItems = activeItems.filter((item) => item.id === unit.groupId);
      }
      return {
        key: unit.key,
        type: unit.type,
        id: unit.id,
        requestedIds: [...new Set(unit.requestedIds)].sort(),
        affectedItems: affectedItems.map((item) => ({
          id: item.id,
          name: item.name,
          resource: item.resource,
          scope: item.scope,
          sourcePath: item.sourcePath,
        })),
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}

function isCodexSkillListMember(item) {
  return item.platform === 'codex'
    && item.kind === 'agent-skill-description'
    && (item.resource === 'skill' || item.resource === 'plugin');
}

function aggregateSavings(activeItems, affectedIds, resource) {
  const aggregateKind = resource === 'skill' ? 'codex-skill-list' : 'plugin-skill-list';
  const aggregate = activeItems.find((item) => item.kind === aggregateKind);
  if (!aggregate || aggregate.estimateStatus !== 'estimated') return 0;

  const members = activeItems.filter(
    (item) => item.resource === resource && isCodexSkillListMember(item),
  );
  const removedChars = members
    .filter((item) => affectedIds.has(item.id) && item.estimateStatus === 'estimated')
    .reduce((sum, item) => sum + item.estimatedChars, 0);
  if (removedChars === 0) return 0;

  const totalChars = members.reduce((sum, item) => sum + item.estimatedChars, 0);
  const officialCap = aggregate.officialLimit?.kind === 'chars'
    ? numberOrZero(aggregate.officialLimit.value)
    : aggregate.estimatedChars;
  const cap = officialCap > 0 ? officialCap : totalChars;
  const beforeChars = Math.min(totalChars, cap);
  const afterChars = Math.min(Math.max(0, totalChars - removedChars), cap);
  if (beforeChars === 0) return 0;
  return Math.round(aggregate.estimatedTokens * ((beforeChars - afterChars) / beforeChars));
}

function estimateSavings(snapshot, affectedIds) {
  const activeItems = snapshot.items.filter((item) => item.enabled !== false);
  const affectedItems = activeItems.filter((item) => affectedIds.has(item.id) && !isAggregate(item));
  const knownItems = affectedItems.filter((item) => item.estimateStatus === 'estimated');
  const unknownItems = affectedItems.filter((item) => item.estimateStatus !== 'estimated');

  const directFixedTokens = knownItems
    .filter((item) => !isCodexSkillListMember(item))
    .reduce((sum, item) => sum + item.estimatedTokens, 0);
  const skillListTokens = aggregateSavings(activeItems, affectedIds, 'skill');
  const pluginListTokens = aggregateSavings(activeItems, affectedIds, 'plugin');
  const aggregateFixedTokens = skillListTokens + pluginListTokens;
  const fixedEstimatedTokens = Math.min(
    snapshot.summary.totalEstimatedTokens,
    directFixedTokens + aggregateFixedTokens,
  );
  const activationPotentialTokens = Math.min(
    snapshot.summary.activationTokens,
    knownItems.reduce((sum, item) => sum + item.activationEstimatedTokens, 0)
      + aggregateFixedTokens,
  );
  const baseline = snapshot.summary.totalEstimatedTokens;

  return {
    fixedEstimatedTokens,
    fixedEstimatedPercent: baseline > 0
      ? Number(((fixedEstimatedTokens / baseline) * 100).toFixed(1))
      : 0,
    estimatedAfterTokens: Math.max(0, baseline - fixedEstimatedTokens),
    activationPotentialTokens,
    unknownCostItems: unknownItems.map((item) => ({ id: item.id, name: item.name })),
    components: {
      directFixedTokens,
      skillListTokens,
      pluginListTokens,
    },
    method: 'Approximate pre-apply estimate with Codex skill/plugin list aggregation and hierarchy deduplication.',
    billingMeasurement: false,
  };
}

async function commandSnapshot(options) {
  const scope = options.scope || 'all';
  if (!['project', 'global', 'all'].includes(scope)) {
    throw new OptimizerError(`Invalid scope: ${scope}`);
  }
  const snapshot = await collectSnapshot({
    projectDir: await resolveProjectDir(options.project),
    platform: options.platform || 'codex',
    scope,
    includeMcp: options.includeMcp === true,
  });
  await saveState('snapshots', snapshot);
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
}

async function commandPreview(options) {
  const snapshot = await loadState('snapshots', assertStateId(options.snapshot, 'snapshot'));
  const requestedIds = [...new Set(options.disable)];
  if (requestedIds.length === 0) {
    throw new OptimizerError('Preview requires at least one --disable resource ID');
  }

  const itemById = new Map(snapshot.items.filter((item) => item.id).map((item) => [item.id, item]));
  const selectedItems = requestedIds.map((id) => {
    const item = itemById.get(id);
    if (!item) throw new OptimizerError(`Resource is not in snapshot: ${id}`);
    if (!item.selectable) {
      throw new OptimizerError(`Resource is not selectable: ${id}`, {
        selectionBlock: item.selectionBlock,
      });
    }
    return item;
  });

  const operations = buildOperations(snapshot.items, selectedItems);
  const affectedIds = new Set(operations.flatMap((operation) =>
    operation.affectedItems.map((item) => item.id),
  ));
  const planCore = {
    schemaVersion,
    kind: 'skill-doctor-context-plan',
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    snapshotId: snapshot.id,
    inventoryFingerprint: snapshot.inventoryFingerprint,
    projectDir: snapshot.projectDir,
    platform: snapshot.platform,
    scope: snapshot.scope,
    coverage: snapshot.coverage,
    baseline: snapshot.summary,
    requestedIds: requestedIds.sort(),
    operations,
    estimate: estimateSavings(snapshot, affectedIds),
  };
  const confirmationDigest = digest(planCore);
  const plan = { ...planCore, confirmationDigest };
  await saveState('plans', plan);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

async function runToggle(action, operation, plan) {
  const result = await runSkillDoctorJson([
    'context',
    action,
    '--id',
    operation.id,
    '--platform',
    plan.platform,
    '--json',
  ], plan.projectDir);
  if (result?.supported !== true) {
    throw new OptimizerError(`Resource cannot be ${action}d: ${operation.id}`, {
      result,
    });
  }
  return result;
}

async function rollbackOperations(changedOperations, plan) {
  const results = [];
  for (const entry of [...changedOperations].reverse()) {
    try {
      const result = await runToggle('enable', entry.operation, plan);
      results.push({ id: entry.operation.id, ok: true, result });
    } catch (error) {
      results.push({
        id: entry.operation.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    complete: results.every((result) => result.ok),
    results,
  };
}

function verifiedSavings(before, after) {
  const fixedEstimatedTokens = before.totalEstimatedTokens - after.totalEstimatedTokens;
  return {
    fixedEstimatedTokens,
    fixedEstimatedPercent: before.totalEstimatedTokens > 0
      ? Number(((fixedEstimatedTokens / before.totalEstimatedTokens) * 100).toFixed(1))
      : 0,
    activationPotentialTokens: before.activationTokens - after.activationTokens,
    billingMeasurement: false,
    method: 'Difference between skill-doctor estimator snapshots before and after apply.',
  };
}

async function commandApply(options) {
  const plan = await loadState('plans', assertStateId(options.plan, 'plan'));
  const { confirmationDigest, ...planCore } = plan;
  if (digest(planCore) !== confirmationDigest) {
    throw new OptimizerError('Plan record failed its integrity check; create a new preview');
  }
  if (!options.confirm || options.confirm !== plan.confirmationDigest) {
    throw new OptimizerError('Confirmation digest does not match the selected plan');
  }

  const before = await collectSnapshot({
    projectDir: plan.projectDir,
    platform: plan.platform,
    scope: plan.scope,
    includeMcp: plan.coverage.mcpRuntimeDiscovery,
  });
  if (before.inventoryFingerprint !== plan.inventoryFingerprint) {
    throw new OptimizerError('Context inventory changed after preview; create a new snapshot and plan');
  }

  const operationId = randomUUID();
  const changedOperations = [];
  const results = [];
  try {
    for (const operation of plan.operations) {
      const result = await runToggle('disable', operation, plan);
      results.push({ id: operation.id, result });
      if (result.changed === true) changedOperations.push({ operation, result });
    }

    const after = await collectSnapshot({
      projectDir: plan.projectDir,
      platform: plan.platform,
      scope: plan.scope,
      includeMcp: plan.coverage.mcpRuntimeDiscovery,
    });
    const record = {
      schemaVersion,
      kind: 'skill-doctor-context-operation',
      id: operationId,
      planId: plan.id,
      createdAt: new Date().toISOString(),
      status: 'applied',
      projectDir: plan.projectDir,
      platform: plan.platform,
      scope: plan.scope,
      coverage: plan.coverage,
      changedOperations,
      results,
      before: before.summary,
      after: after.summary,
      verifiedSavings: verifiedSavings(before.summary, after.summary),
      requiresNewSession: results.some((entry) => entry.result?.requiresNewSession === true),
    };
    await saveState('operations', record);
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
  } catch (error) {
    const rollback = await rollbackOperations(changedOperations, plan);
    const record = {
      schemaVersion,
      kind: 'skill-doctor-context-operation',
      id: operationId,
      planId: plan.id,
      createdAt: new Date().toISOString(),
      status: rollback.complete ? 'rolled-back' : 'rollback-partial',
      projectDir: plan.projectDir,
      platform: plan.platform,
      changedOperations,
      results,
      rollback,
      failure: error instanceof Error ? error.message : String(error),
    };
    await saveState('operations', record);
    throw new OptimizerError(
      rollback.complete
        ? 'Apply failed; completed changes were rolled back'
        : 'Apply failed and rollback was incomplete',
      { operationId, status: record.status, rollback, failure: record.failure },
    );
  }
}

async function commandUndo(options) {
  const operation = await loadState(
    'operations',
    assertStateId(options.operation, 'operation'),
  );
  if (operation.status === 'undone') {
    process.stdout.write(`${JSON.stringify(operation, null, 2)}\n`);
    return;
  }
  if (!['applied', 'undo-partial'].includes(operation.status)) {
    throw new OptimizerError(`Operation cannot be undone from status: ${operation.status}`);
  }

  const plan = {
    projectDir: operation.projectDir,
    platform: operation.platform,
  };
  const results = [];
  for (const entry of [...operation.changedOperations].reverse()) {
    try {
      const result = await runToggle('enable', entry.operation, plan);
      results.push({ id: entry.operation.id, ok: true, result });
    } catch (error) {
      results.push({
        id: entry.operation.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const complete = results.every((result) => result.ok);
  let afterUndo = null;
  let verificationWarning = null;
  if (complete) {
    try {
      afterUndo = await collectSnapshot({
        projectDir: operation.projectDir,
        platform: operation.platform,
        scope: operation.scope,
        includeMcp: operation.coverage.mcpRuntimeDiscovery,
      });
    } catch (error) {
      verificationWarning = error instanceof Error ? error.message : String(error);
    }
  }

  const updated = {
    ...operation,
    status: complete ? 'undone' : 'undo-partial',
    undoneAt: complete ? new Date().toISOString() : null,
    undoResults: results,
    afterUndo: afterUndo?.summary ?? null,
    verificationWarning,
  };
  await saveState('operations', updated);
  if (!complete) {
    throw new OptimizerError('Undo was incomplete', {
      operationId: operation.id,
      results,
    });
  }
  process.stdout.write(`${JSON.stringify(updated, null, 2)}\n`);
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === 'help' || command === '--help' || command === '-h' || options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command === 'snapshot') return commandSnapshot(options);
  if (command === 'preview') return commandPreview(options);
  if (command === 'apply') return commandApply(options);
  if (command === 'undo') return commandUndo(options);
  throw new OptimizerError(`Unknown command: ${command}`, { usage: usage() });
}

main().catch((error) => {
  const payload = {
    error: {
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof OptimizerError ? error.details : {}),
    },
  };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = 1;
});
