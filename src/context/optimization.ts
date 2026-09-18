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
import type { OptimizationOperation, OptimizationOverview, OptimizationPeriod, OptimizationPreview, OptimizationSession, OptimizationTarget, OptimizationVerification } from './optimizationTypes';

// Version of the Desktop fresh-task experiments in codex-context-block-verification.md.
const VERIFIED_VERSION = '0.154.0-alpha.6.2';
const TARGETS = {
  'skill-catalog': { table: 'skills', key: 'include_instructions', kind: 'host_skills.instructions', scope: 'project' },
  memory: { table: 'memories', key: 'use_memories', kind: 'memories.instructions', scope: 'user' },
} as const;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const read = (path: string) => existsSync(path) ? readFileSync(path, 'utf8') : '';
type Config = Record<string, Record<string, unknown>>;
interface StoredOperation extends OptimizationOperation { before?: boolean; fingerprint: string }

function targetDefinition(target: OptimizationTarget) {
  if (!Object.hasOwn(TARGETS, target)) throw new Error('Unsupported optimization target.');
  return TARGETS[target];
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
  if (target === 'skill-catalog' && configPath(projectDir, target, homeDir) === userPath) return true;
  const { table, key } = TARGETS[target];
  return [...paths].some((path) => {
    const config = parseTOML<Record<string, any>>(read(path));
    // Active profile/host overrides cannot be resolved from a historical task.
    return (target === 'memory' && path !== userPath && config[table]?.[key] !== undefined)
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
    const initial = header.complete ? Object.fromEntries(Object.entries(TARGETS).map(([id, def]) => [id, counter.count(header.kinds[def.kind] ?? '')])) : {};
    const observations = await responseTargetTokens(session.filePath, records, initial);
    const suggestions: OptimizationSession['suggestions'] = (Object.keys(TARGETS) as OptimizationTarget[]).map((id) => {
      const def = TARGETS[id];
      const path = configPath(projectDir, id, homeDir);
      const configuredOff = configValue(read(path), id) === false;
      const observed = header.kinds[def.kind];
      const tokens = header.complete ? counter.count(observed ?? '') : undefined;
      const versionSupported = header.version === VERIFIED_VERSION && (!latestVersion || latestVersion === VERIFIED_VERSION);
      const overridden = hasConfigOverride(projectDir, id, homeDir);
      const available = header.complete && versionSupported && Boolean(observed) && !configuredOff && !overridden;
      const cost = tokens !== undefined && records[0] ? responseSavingsCost(tokens, records[0], 'max') : undefined;
      const actualCost = tokens !== undefined && records[0] ? responseSavingsCost(tokens, records[0], 'actual') : undefined;
      const cumulative = cumulativeSavings(id, records, observations, 'max');
      const actualCumulative = cumulativeSavings(id, records, observations, 'actual');
      return { id, scope: def.scope, configPath: path, configKey: `${def.table}.${def.key}`, configuredOff, available, tokens, cost, actualCost,
        cumulative: { ...cumulative, actualCost: actualCumulative.cost, actualPricedResponses: actualCumulative.pricedResponses },
        reason: overridden ? 'config-override' : configuredOff ? 'configured-off' : !header.complete ? 'incomplete-header' : !versionSupported ? 'unsupported-version' : !observed ? 'absent' : undefined };
    });
    const amount = (items: Array<{ amount?: number }>): number | undefined => {
      const priced = items.filter((item): item is { amount: number } => item.amount !== undefined);
      return priced.length ? priced.reduce((sum, item) => sum + item.amount, 0) : undefined;
    };
    return { id: session.sessionId, timestamp: session.timestamp, version: header.version, model, sourcePath: session.filePath, completeHeader: header.complete, usage,
      responseCount: records.length, turnCount: records.length && records.every((record) => record.rootTurnId || record.turnId) ? new Set(records.map((record) => record.rootTurnId ?? record.turnId)).size : undefined,
      cost: amount(costs),
      actualCost: amount(actualCosts),
      costCoverage: costs.filter((cost) => cost.amount !== undefined).length,
      actualCostCoverage: actualCosts.filter((cost) => cost.amount !== undefined).length, suggestions };
  }));
  return { projectDir: realpathSync(projectDir), generatedAt: new Date().toISOString(), period, periodStart: bounds.start.toISOString(), periodEnd: bounds.end.toISOString(), maxPriceModel: maxPrice?.model ?? '—', sessions, priceDate: DEFAULT_BENEFIT_PRICE_TABLE.updatedAt, diagnostics: scan.diagnostics.filter((d) => d.severity !== 'info').map((d) => d.message).slice(0, 10) };
}

export async function previewOptimization(projectDir: string, sessionId: string, target: OptimizationTarget, homeDir?: string): Promise<OptimizationPreview> {
  const overview = await optimizationOverview(projectDir, homeDir);
  const suggestion = overview.sessions.find((s) => s.id === sessionId)?.suggestions.find((s) => s.id === target);
  if (!suggestion?.available) throw new Error('This optimization is unavailable or already configured. Refresh the analysis.');
  const before = configValue(read(suggestion.configPath), target);
  const state = { projectDir: realpathSync(projectDir), sessionId, target, fingerprint: fingerprint(projectDir, homeDir) };
  return { target, scope: suggestion.scope, configPath: suggestion.configPath, configKey: suggestion.configKey, before, after: false, confirmation: hash(JSON.stringify(state)) };
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

function withConfigLock<T>(path: string, run: () => T): T {
  assertSafePath(path);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const lock = `${path}.skill-doctor.lock`;
  writeFileSync(lock, '', { flag: 'wx', mode: 0o600 });
  try { return run(); } finally { unlinkSync(lock); }
}

export async function applyOptimization(projectDir: string, sessionId: string, target: OptimizationTarget, confirmation: string, homeDir?: string): Promise<OptimizationOperation> {
  const preview = await previewOptimization(projectDir, sessionId, target, homeDir);
  if (preview.confirmation !== confirmation) throw new Error('Configuration changed. Review this optimization again.');
  const beforeFingerprint = fingerprint(projectDir, homeDir);
  return withConfigLock(preview.configPath, () => {
    if (fingerprint(projectDir, homeDir) !== beforeFingerprint) throw new Error('Configuration changed during confirmation.');
    const before = read(preview.configPath);
    const after = editOptimizationConfig(before, target, false);
    const operation: StoredOperation = { id: randomUUID(), target, projectDir: realpathSync(projectDir), configPath: preview.configPath, createdAt: new Date().toISOString(), version: VERIFIED_VERSION, before: preview.before, status: 'pending', fingerprint: '' };
    const dir = operationsDir(projectDir, homeDir);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    // Persist recovery metadata before changing configuration; never store the complete config.
    atomicWrite(join(dir, `${operation.id}.json`), JSON.stringify(operation));
    atomicWrite(preview.configPath, after);
    if (read(preview.configPath) !== after) throw new Error('Configuration read-back failed.');
    operation.fingerprint = fingerprint(projectDir, homeDir);
    atomicWrite(join(dir, `${operation.id}.json`), JSON.stringify(operation));
    const { before: _before, fingerprint: _fingerprint, ...publicOperation } = operation;
    return publicOperation;
  });
}

function loadOperation(projectDir: string, id: string, homeDir?: string): StoredOperation {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid operation ID.');
  const path = join(operationsDir(projectDir, homeDir), `${id}.json`);
  assertSafePath(path);
  const operation = JSON.parse(readFileSync(path, 'utf8')) as StoredOperation;
  if (operation.projectDir !== realpathSync(projectDir) || operation.configPath !== configPath(projectDir, operation.target, homeDir)) throw new Error('Operation project mismatch.');
  return operation;
}

export function undoOptimization(projectDir: string, id: string, homeDir?: string): OptimizationOperation {
  const operation = loadOperation(projectDir, id, homeDir);
  if (operation.status !== 'pending') throw new Error('Operation already restored.');
  return withConfigLock(operation.configPath, () => {
    const current = read(operation.configPath);
    if (configValue(current, operation.target) !== false) throw new Error('Target setting changed externally; refusing to overwrite it.');
    atomicWrite(operation.configPath, editOptimizationConfig(current, operation.target, operation.before));
    operation.status = 'restored';
    atomicWrite(join(operationsDir(projectDir, homeDir), `${id}.json`), JSON.stringify(operation));
    const { before: _before, fingerprint: _fingerprint, ...publicOperation } = operation;
    return publicOperation;
  });
}

export async function verifyOptimization(projectDir: string, id: string, homeDir?: string): Promise<OptimizationVerification> {
  const op = loadOperation(projectDir, id, homeDir);
  if (op.status !== 'pending' || fingerprint(projectDir, homeDir) !== op.fingerprint) return { status: 'unknown', reason: 'config-changed' };
  const overview = await optimizationOverview(projectDir, homeDir);
  const fresh = overview.sessions.find((s) => Date.parse(s.timestamp) > Date.parse(op.createdAt) && s.completeHeader && s.version === op.version);
  if (!fresh) return { status: 'unknown', reason: 'new-task-required' };
  if (fingerprint(projectDir, homeDir) !== op.fingerprint) return { status: 'unknown', reason: 'config-changed' };
  const header = readOptimizationHeader(fresh.sourcePath);
  if (!header.complete) return { status: 'unknown', reason: 'incomplete-header' };
  return { status: header.kinds[TARGETS[op.target].kind] ? 'present' : 'removed', reason: 'fresh-header-observed', sessionId: fresh.id, sourcePath: fresh.sourcePath };
}
