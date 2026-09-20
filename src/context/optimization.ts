import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parseTOML } from 'confbox/toml';
import { scanCodexSessions } from '../benefit/codexSessions';
import { calculateBenefitCost, DEFAULT_BENEFIT_PRICE_TABLE, findBenefitPrice, findMostExpensiveBenefitPrice } from '../benefit/prices';
import type { CodexUsage } from '../benefit/types';
import { createTokenCounter } from './tokenCounter';
import { cumulativeSavings, responseSavingsCost, responseTargetTokens } from './optimizationSavings';
import { optimizationRecommendations } from './optimizationRecommendations';
import type { OptimizationOperation, OptimizationOverview, OptimizationPeriod, OptimizationPreview, OptimizationSession, OptimizationTarget, OptimizationVerification } from './optimizationTypes';

// Version of the Desktop fresh-task experiments in codex-context-block-verification.md.
const VERIFIED_VERSION = '0.154.0-alpha.6.2';
const TARGETS = {
  'skill-catalog': { table: 'skills', key: 'include_instructions', kinds: ['host_skills.instructions'], scope: 'project' },
  memory: { table: 'memories', key: 'use_memories', kinds: ['memories.instructions'], scope: 'user' },
  plugins: { table: 'features', key: 'plugins', kinds: ['plugins.usage_instructions', 'plugins.recommendations'], scope: 'user' },
} as const;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const read = (path: string) => existsSync(path) ? readFileSync(path, 'utf8') : '';
type Config = Record<string, Record<string, unknown>>;
interface StoredOperation extends OptimizationOperation {
  beforeValues: Partial<Record<OptimizationTarget, boolean>>;
  fingerprint: string;
}
interface SkillCatalogConfig {
  projectPath: string;
  globalPath: string;
  values: NonNullable<OptimizationSession['suggestions'][number]['configValues']>;
}

function targetDefinition(target: OptimizationTarget) {
  if (!Object.hasOwn(TARGETS, target)) throw new Error('Unsupported optimization target.');
  return TARGETS[target];
}

function normalizeTargets(targets: OptimizationTarget | OptimizationTarget[]): OptimizationTarget[] {
  const values = Array.isArray(targets) ? targets : [targets];
  const unique = [...new Set(values)];
  if (!unique.length) throw new Error('At least one optimization target is required.');
  unique.forEach((target) => targetDefinition(target));
  return unique;
}

function targetText(header: Header, target: OptimizationTarget): string {
  return targetDefinition(target).kinds.map((kind) => header.kinds[kind] ?? '').filter(Boolean).join('');
}

function scopeFor(suggestions: Array<{ scope: 'project' | 'user' }>): 'project' | 'user' | 'mixed' {
  const hasProject = suggestions.some((suggestion) => suggestion.scope === 'project');
  const hasUser = suggestions.some((suggestion) => suggestion.scope === 'user');
  return hasProject && hasUser ? 'mixed' : hasUser ? 'user' : 'project';
}

function codexHome(homeDir = homedir()): string {
  return resolve(homeDir === homedir() && process.env.CODEX_HOME ? process.env.CODEX_HOME : join(realpathSync(homeDir), '.codex'));
}

function assertSafePath(path: string): void {
  for (let current = resolve(path); dirname(current) !== current; current = dirname(current)) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('Refusing a symlinked configuration or operation path.');
  }
}

function configPath(projectDir: string, target: OptimizationTarget, homeDir?: string): string {
  const def = targetDefinition(target);
  const path = def.scope === 'project' ? join(realpathSync(projectDir), '.codex/config.toml') : join(codexHome(homeDir), 'config.toml');
  assertSafePath(path);
  return path;
}

function configValue(raw: string, target: OptimizationTarget): boolean | undefined {
  const def = targetDefinition(target);
  const value = parseTOML<Config>(raw)[def.table]?.[def.key];
  if (value !== undefined && typeof value !== 'boolean') throw new Error('Expected a boolean configuration value.');
  return value;
}

function skillCatalogConfig(projectDir: string, homeDir?: string): SkillCatalogConfig {
  const projectPath = configPath(projectDir, 'skill-catalog', homeDir);
  const globalPath = configPath(projectDir, 'memory', homeDir);
  const project = configValue(read(projectPath), 'skill-catalog');
  const global = configValue(read(globalPath), 'skill-catalog');
  const source = project !== undefined ? 'project' : global !== undefined ? 'global' : 'default';
  return { projectPath, globalPath, values: { ...(project === undefined ? {} : { project }), ...(global === undefined ? {} : { global }), effective: project ?? global ?? true, source } };
}

// Preserve comments and unrelated keys; unsupported TOML layouts fail closed.
export function editOptimizationConfig(raw: string, target: OptimizationTarget, value: boolean | undefined): string {
  const { table, key } = targetDefinition(target);
  const expected = structuredClone(parseTOML<Config>(raw));
  expected[table] ??= {};
  if (value === undefined) delete expected[table][key];
  else expected[table][key] = value;
  const lines = raw.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^\\[${table}\\]\\s*(?:#.*)?$`).test(line));
  const assignment = value === undefined ? undefined : `${key} = ${value}`;
  if (start < 0) {
    lines.push(`[${table}]`, ...(assignment ? [assignment] : []), '');
  } else {
    let end = start + 1;
    while (end < lines.length && !/^\s*\[/.test(lines[end])) end++;
    const index = lines.findIndex((line, i) => i > start && i < end && new RegExp(`^\\s*${key}\\s*=`).test(line));
    if (index >= 0) lines.splice(index, 1, ...(assignment ? [assignment] : []));
    else if (assignment) lines.splice(end, 0, assignment);
  }
  const next = lines.join('\n');
  if (!isDeepStrictEqual(parseTOML(next), expected)) throw new Error('Unsupported TOML layout; no configuration changed.');
  return next;
}

interface Header {
  complete: boolean;
  kinds: Record<string, string>;
  version?: string;
}

/** Only an ordinal-zero, non-inherited initial header can prove absence. */
export function readOptimizationHeader(path: string): Header {
  const fd = openSync(path, 'r');
  const buffer = Buffer.alloc(8 * 1024 * 1024);
  let length: number;
  try { length = readSync(fd, buffer, 0, buffer.length, 0); } finally { closeSync(fd); }
  const lines = buffer.subarray(0, length).toString('utf8').split('\n');
  const result: Header = { complete: false, kinds: {} };
  const roles = new Set<string>();
  let fullState = false;
  let expectedOrdinal = 0;
  try {
    for (const raw of lines) {
      if (!raw.trim()) continue;
      const item = JSON.parse(raw);
      const p = item.payload ?? {};
      if (item.ordinal !== expectedOrdinal++) return result;
      if (item.type === 'session_meta') {
        if (expectedOrdinal !== 1 || p.forked_from_id || p.parent_thread_id || (p.history_base?.end_ordinal_exclusive ?? 0) > 0) return result;
        result.version = p.cli_version;
      }
      if (item.type === 'compacted') return result;
      if (item.type === 'world_state' && p.full === true) fullState = true;
      if (item.type === 'turn_context') {
        result.complete = Boolean(result.version && fullState && roles.has('developer') && roles.has('user'));
        return result;
      }
      if (item.type !== 'response_item' || !['developer', 'user'].includes(p.role)) continue;
      const kinds = p.internal_chat_message_metadata_passthrough?.content_item_kinds;
      if (!Array.isArray(kinds) || !Array.isArray(p.content) || kinds.length !== p.content.length || kinds.some((kind: unknown) => typeof kind !== 'string')) return result;
      roles.add(p.role);
      for (let i = 0; i < kinds.length; i++) {
        if (typeof p.content[i]?.text !== 'string') return result;
        result.kinds[kinds[i]] = (result.kinds[kinds[i]] ?? '') + p.content[i].text;
      }
    }
  } catch { /* Incomplete or malformed initial snapshot cannot prove absence. */ }
  return result;
}

function fingerprint(projectDir: string, homeDir?: string): string {
  const paths = new Set<string>([join(codexHome(homeDir), 'config.toml')]);
  for (let dir = realpathSync(projectDir); ; dir = dirname(dir)) {
    paths.add(join(dir, '.codex/config.toml'));
    if (dirname(dir) === dir) break;
  }
  return hash(JSON.stringify([...paths].map((path) => [path, read(path)])));
}

function hasConfigOverride(projectDir: string, target: OptimizationTarget, homeDir?: string): boolean {
  const userPath = join(codexHome(homeDir), 'config.toml');
  const paths = new Set([userPath]);
  for (let dir = realpathSync(projectDir); ; dir = dirname(dir)) {
    paths.add(join(dir, '.codex/config.toml'));
    if (dirname(dir) === dir) break;
  }
  const { table, key, scope } = targetDefinition(target);
  return [...paths].some((path) => {
    const config = parseTOML<Record<string, any>>(read(path));
    // Active profile/host overrides cannot be resolved from a historical task.
    return (scope === 'user' && path !== userPath && config[table]?.[key] !== undefined)
      || Object.values(config.profiles ?? {}).some((profile: any) => profile?.[table]?.[key] !== undefined);
  });
}

export function optimizationPeriodBounds(period: OptimizationPeriod, now = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const daysSinceMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);
  } else {
    start.setDate(1);
  }
  return { start, end: new Date(now) };
}

export async function optimizationOverview(projectDir: string, homeDir?: string, period: OptimizationPeriod = 'month'): Promise<OptimizationOverview> {
  const bounds = optimizationPeriodBounds(period);
  const scan = await scanCodexSessions({ projectDir, homeDir, sinceMs: bounds.start.getTime(), untilMs: bounds.end.getTime(), limit: 5000, includeArchived: false, useIndex: false, includeContext: false, exactProjectOnly: true });
  const counter = createTokenCounter({ tokenizer: 'openai', preserveWhitespace: true });
  const project = realpathSync(projectDir);
  const latestVersion = scan.selected[0]?.analysis.meta?.cliVersion;
  const maxPrice = findMostExpensiveBenefitPrice(DEFAULT_BENEFIT_PRICE_TABLE);
  const skillConfig = skillCatalogConfig(projectDir, homeDir);
  const seen = new Set<string>();
  const sessions: OptimizationSession[] = await Promise.all(scan.selected.filter(({ session }) => {
    if (!session.cwd || !existsSync(session.cwd) || realpathSync(session.cwd) !== project || seen.has(session.sessionId)) return false;
    // The scanner orders by latest activity; keep one current log per task.
    seen.add(session.sessionId);
    return true;
  }).map(async ({ session, analysis, usage: selectedUsage }) => {
    const header = readOptimizationHeader(session.filePath);
    // Show this task's own response records, not inherited/child usage.
    const records = [...new Map(selectedUsage.filter((r) => r.threadId === session.threadId).map((r) => [r.responseId, r])).values()];
    const usage = records.length && records.every((r) => r.quality === 'complete') ? records.reduce<CodexUsage>((total, r) => {
      for (const key of Object.keys(total) as Array<keyof CodexUsage>) total[key] += r.usage[key];
      return total;
    }, { inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 }) : undefined;
    const costs = records.map((r) => r.quality === 'complete' ? calculateBenefitCost(r.usage, maxPrice) : { amount: undefined });
    const actualCosts = records.map((r) => r.quality === 'complete' ? calculateBenefitCost(r.usage, findBenefitPrice(r.model, DEFAULT_BENEFIT_PRICE_TABLE)) : { amount: undefined });
    const model = records[0]?.model ?? analysis.modelContexts[0]?.model;
    const initial: Partial<Record<OptimizationTarget, number>> = {};
    if (header.complete) {
      for (const id of Object.keys(TARGETS) as OptimizationTarget[]) {
        const text = targetText(header, id);
        if (text) initial[id] = counter.count(text);
      }
    }
    const observations = await responseTargetTokens(session.filePath, records, initial);
    const suggestions: OptimizationSession['suggestions'] = (Object.keys(TARGETS) as OptimizationTarget[]).map((id) => {
      const def = TARGETS[id];
      const path = configPath(projectDir, id, homeDir);
      const configValues = id === 'skill-catalog' ? skillConfig.values : undefined;
      const configuredOff = id === 'skill-catalog' ? configValues!.effective === false : configValue(read(path), id) === false;
      const observed = targetText(header, id);
      const tokens = header.complete ? counter.count(observed ?? '') : undefined;
      const versionSupported = /^\d+\.\d+\.\d+/.test(latestVersion ?? header.version ?? '');
      const versionWarning = header.version !== VERIFIED_VERSION || Boolean(latestVersion && latestVersion !== VERIFIED_VERSION);
      const overridden = hasConfigOverride(projectDir, id, homeDir);
      const canSelectWithoutObservedBlock = id === 'skill-catalog' || id === 'plugins';
      const available = header.complete && versionSupported && !configuredOff && !overridden && (canSelectWithoutObservedBlock || Boolean(observed));
      const cost = tokens !== undefined && records[0] ? responseSavingsCost(tokens, records[0], 'max') : undefined;
      const actualCost = tokens !== undefined && records[0] ? responseSavingsCost(tokens, records[0], 'actual') : undefined;
      const cumulative = cumulativeSavings(id, records, observations, 'max');
      const actualCumulative = cumulativeSavings(id, records, observations, 'actual');
      const knownZeroCumulative = canSelectWithoutObservedBlock && header.complete && !observed && cumulative.tokens === undefined;
      return { id, scope: def.scope, configPath: path, configKey: `${def.table}.${def.key}`, configuredOff, available, canEnable: configuredOff && versionSupported && !overridden, ...(configValues ? { configValues } : {}), versionWarning, tokens, cost, actualCost,
        cumulative: { ...cumulative, ...(knownZeroCumulative ? { tokens: 0 } : {}), actualCost: actualCumulative.cost, actualPricedResponses: actualCumulative.pricedResponses },
        reason: overridden ? 'config-override' : configuredOff ? 'configured-off' : !header.complete ? 'incomplete-header' : !versionSupported ? 'unsupported-version' : !observed ? 'absent' : undefined };
    });
    const amount = (items: Array<{ amount?: number }>): number | undefined => {
      const priced = items.filter((item): item is { amount: number } => item.amount !== undefined);
      return priced.length ? priced.reduce((sum, item) => sum + item.amount, 0) : undefined;
    };
    return { id: session.sessionId, timestamp: session.timestamp, version: header.version, model, sourcePath: session.filePath, completeHeader: header.complete, usage,
      headerBlocks: Object.entries(header.kinds).map(([kind, text]) => {
        const characters = Array.from(text);
        const target = (Object.keys(TARGETS) as OptimizationTarget[]).find((id) => (TARGETS[id].kinds as readonly string[]).includes(kind));
        return { kind, excerpt: characters.slice(0, 50).join(''), characters: characters.length, target };
      }),
      responseCount: records.length, turnCount: records.length && records.every((record) => record.rootTurnId || record.turnId) ? new Set(records.map((record) => record.rootTurnId ?? record.turnId)).size : undefined,
      cost: amount(costs),
      actualCost: amount(actualCosts),
      costCoverage: costs.filter((cost) => cost.amount !== undefined).length,
      actualCostCoverage: actualCosts.filter((cost) => cost.amount !== undefined).length, suggestions };
  }));
  const recommendations = await optimizationRecommendations(sessions.map((session) => session.sourcePath), bounds.start, bounds.end);
  const history = await scanCodexSessions({ projectDir, homeDir, sinceMs: 0, untilMs: bounds.end.getTime(), limit: 5000, includeArchived: true, useIndex: false, includeContext: false, exactProjectOnly: true });
  let previewBaseline: OptimizationOverview['previewBaseline'];
  for (const { session } of [...history.selected].sort((a, b) => Date.parse(a.session.timestamp) - Date.parse(b.session.timestamp))) {
    const header = readOptimizationHeader(session.filePath);
    if (!header.complete || !(Object.keys(TARGETS) as OptimizationTarget[]).every((target) => targetText(header, target))) continue;
    previewBaseline = { id: session.sessionId, timestamp: session.timestamp, sourcePath: session.filePath,
      blocks: Object.entries(header.kinds).map(([kind, text]) => ({ kind, text, target: (Object.keys(TARGETS) as OptimizationTarget[]).find((id) => (TARGETS[id].kinds as readonly string[]).includes(kind)) })) };
    break;
  }
  return { projectDir: realpathSync(projectDir), generatedAt: new Date().toISOString(), period, periodStart: bounds.start.toISOString(), periodEnd: bounds.end.toISOString(), maxPriceModel: maxPrice?.model ?? '—', sessions, previewBaseline, recommendations, priceDate: DEFAULT_BENEFIT_PRICE_TABLE.updatedAt, diagnostics: [...scan.diagnostics, ...history.diagnostics].filter((d) => d.severity !== 'info').map((d) => d.message).slice(0, 10) };
}

export async function previewOptimization(projectDir: string, sessionId: string, targetsInput: OptimizationTarget | OptimizationTarget[], homeDir?: string, enabled = false): Promise<OptimizationPreview> {
  const targets = normalizeTargets(targetsInput);
  const overview = await optimizationOverview(projectDir, homeDir);
  const suggestions = targets.map((target) => overview.sessions.find((s) => s.id === sessionId)?.suggestions.find((s) => s.id === target));
  if (suggestions.some((suggestion) => !(enabled ? suggestion?.canEnable : suggestion?.available))) throw new Error('This optimization is unavailable or already configured. Refresh the analysis.');
  const available = suggestions as NonNullable<typeof suggestions[number]>[];
  const before = Object.fromEntries(targets.map((target, index) => [target, configValue(read(available[index].configPath), target)])) as Partial<Record<OptimizationTarget, boolean>>;
  const state = { projectDir: realpathSync(projectDir), sessionId, targets, enabled, fingerprint: fingerprint(projectDir, homeDir) };
  return {
    targets,
    scope: scopeFor(available),
    configPaths: [...new Set(available.map((suggestion) => suggestion.configPath))],
    configKeys: available.map((suggestion) => suggestion.configKey),
    before,
    after: enabled,
    confirmation: hash(JSON.stringify(state)),
  };
}

function operationsDir(projectDir: string, homeDir = homedir()): string {
  const path = join(realpathSync(homeDir), '.skill-doctor', 'optimization', hash(realpathSync(projectDir)).slice(0, 24));
  assertSafePath(path);
  return path;
}

function atomicWrite(path: string, text: string): void {
  const temp = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temp, text, { mode: 0o600, flag: 'wx' }); renameSync(temp, path); }
  finally { if (existsSync(temp)) unlinkSync(temp); }
}

function withConfigLocks<T>(paths: string[], run: () => T): T {
  const locks: string[] = [];
  try {
    for (const path of [...new Set(paths)].sort()) {
      assertSafePath(path);
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      const lock = `${path}.skill-doctor.lock`;
      writeFileSync(lock, '', { flag: 'wx', mode: 0o600 });
      locks.push(lock);
    }
    return run();
  } finally {
    for (const lock of locks.reverse()) if (existsSync(lock)) unlinkSync(lock);
  }
}

interface ConfigSnapshot { text: string; existed: boolean }

function writeConfigSet(before: Map<string, ConfigSnapshot>, after: Map<string, string>): void {
  const written: string[] = [];
  try {
    for (const [path, text] of after) {
      atomicWrite(path, text);
      written.push(path);
      if (read(path) !== text) throw new Error('Configuration read-back failed.');
    }
  } catch (error) {
    for (const path of written.reverse()) {
      const snapshot = before.get(path)!;
      try {
        if (snapshot.existed) atomicWrite(path, snapshot.text);
        else if (existsSync(path)) unlinkSync(path);
      } catch { /* Preserve the original failure; the operation remains recoverable. */ }
    }
    throw error;
  }
}

export async function applyOptimization(projectDir: string, sessionId: string, targetsInput: OptimizationTarget | OptimizationTarget[], confirmation: string, homeDir?: string, enabled = false): Promise<OptimizationOperation> {
  const preview = await previewOptimization(projectDir, sessionId, targetsInput, homeDir, enabled);
  if (preview.confirmation !== confirmation) throw new Error('Configuration changed. Review this optimization again.');
  const beforeFingerprint = fingerprint(projectDir, homeDir);
  return withConfigLocks(preview.configPaths, () => {
    if (fingerprint(projectDir, homeDir) !== beforeFingerprint) throw new Error('Configuration changed during confirmation.');
    const before = new Map<string, ConfigSnapshot>(preview.configPaths.map((path) => [path, { text: read(path), existed: existsSync(path) }]));
    const after = new Map<string, string>(preview.configPaths.map((path) => [path, before.get(path)!.text]));
    for (const target of preview.targets) {
      const path = configPath(projectDir, target, homeDir);
      after.set(path, editOptimizationConfig(after.get(path) ?? '', target, enabled));
    }
    const operation: StoredOperation = { id: randomUUID(), target: preview.targets[0], targets: preview.targets, projectDir: realpathSync(projectDir), configPath: preview.configPaths[0], configPaths: preview.configPaths, createdAt: new Date().toISOString(), version: VERIFIED_VERSION, beforeValues: preview.before, status: 'pending', fingerprint: '' };
    const dir = operationsDir(projectDir, homeDir);
    operation.enabled = enabled;
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const operationPath = join(dir, `${operation.id}.json`);
    // Persist recovery metadata before changing configuration; never store the complete config.
    atomicWrite(operationPath, JSON.stringify(operation));
    try {
      writeConfigSet(before, after);
      operation.fingerprint = fingerprint(projectDir, homeDir);
      atomicWrite(operationPath, JSON.stringify(operation));
    } catch (error) {
      if (existsSync(operationPath)) unlinkSync(operationPath);
      throw error;
    }
    const { beforeValues: _beforeValues, fingerprint: _fingerprint, ...publicOperation } = operation;
    return publicOperation;
  });
}

function loadOperation(projectDir: string, id: string, homeDir?: string): StoredOperation {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid operation ID.');
  const path = join(operationsDir(projectDir, homeDir), `${id}.json`);
  assertSafePath(path);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as StoredOperation & { before?: boolean };
  const targets = raw.targets?.length ? raw.targets : raw.target ? [raw.target] : [];
  const configPaths = raw.configPaths?.length ? raw.configPaths : raw.configPath ? [raw.configPath] : [];
  const beforeValues = raw.beforeValues ?? (raw.target && raw.before !== undefined ? { [raw.target]: raw.before } : {});
  const operation = { ...raw, targets, configPaths, beforeValues } as StoredOperation;
  const expectedPaths = [...new Set(targets.map((target) => configPath(projectDir, target, homeDir)))];
  if (operation.projectDir !== realpathSync(projectDir) || expectedPaths.length !== configPaths.length || expectedPaths.some((expected) => !configPaths.includes(expected))) throw new Error('Operation project mismatch.');
  return operation;
}

export function undoOptimization(projectDir: string, id: string, homeDir?: string): OptimizationOperation {
  const operation = loadOperation(projectDir, id, homeDir);
  if (operation.status !== 'pending') throw new Error('Operation already restored.');
  return withConfigLocks(operation.configPaths, () => {
    const before = new Map<string, ConfigSnapshot>(operation.configPaths.map((path) => [path, { text: read(path), existed: existsSync(path) }]));
    const after = new Map<string, string>([...before.entries()].map(([path, snapshot]) => [path, snapshot.text]));
    for (const target of operation.targets) {
      const path = configPath(projectDir, target, homeDir);
      const current = after.get(path) ?? '';
      if (configValue(current, target) !== (operation.enabled ?? false)) throw new Error('Target setting changed externally; refusing to overwrite it.');
      after.set(path, editOptimizationConfig(current, target, operation.beforeValues[target]));
    }
    writeConfigSet(before, after);
    operation.status = 'restored';
    atomicWrite(join(operationsDir(projectDir, homeDir), `${id}.json`), JSON.stringify(operation));
    const { beforeValues: _beforeValues, fingerprint: _fingerprint, ...publicOperation } = operation;
    return publicOperation;
  });
}

export async function verifyOptimization(projectDir: string, id: string, homeDir?: string): Promise<OptimizationVerification> {
  const op = loadOperation(projectDir, id, homeDir);
  if (op.status !== 'pending' || fingerprint(projectDir, homeDir) !== op.fingerprint) return { status: 'unknown', reason: 'config-changed' };
  const overview = await optimizationOverview(projectDir, homeDir);
  const fresh = overview.sessions.find((s) => Date.parse(s.timestamp) > Date.parse(op.createdAt) && s.completeHeader);
  if (!fresh) return { status: 'unknown', reason: 'new-task-required' };
  if (fingerprint(projectDir, homeDir) !== op.fingerprint) return { status: 'unknown', reason: 'config-changed' };
  const header = readOptimizationHeader(fresh.sourcePath);
  if (!header.complete) return { status: 'unknown', reason: 'incomplete-header' };
  const targets = op.targets.map((id) => ({ id, status: targetDefinition(id).kinds.some((kind) => Boolean(header.kinds[kind])) ? 'present' as const : 'removed' as const }));
  return { status: targets.some((target) => target.status === 'present') ? 'present' : 'removed', matched: targets.every((target) => target.status === (op.enabled ? 'present' : 'removed')), reason: 'fresh-header-observed', sessionId: fresh.id, sourcePath: fresh.sourcePath, targets };
}
