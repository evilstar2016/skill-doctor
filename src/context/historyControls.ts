import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parseTOML } from 'confbox/toml';
import type { HistoryCandidate } from '../benefit/historyTypes';
import type { BenefitReport } from '../benefit/types';

export interface HistoryControlTarget { kind: 'skill' | 'recommendation' | 'recommendations'; id: string }
export interface HistoryControlPreview {
  target: HistoryControlTarget; enabled: boolean; projectDir: string; configPath: string;
  digest: string; changed: boolean; before: string; after: string;
  scope: 'project'; requiresNewSession: true; controlStatus: 'configured'; runtimeVerified: false;
  verificationReason: string; warnings: string[];
}
type Config = Record<string, any>;
const read = (path: string) => existsSync(path) ? readFileSync(path, 'utf8') : '';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

export function reportControlTarget(report: BenefitReport, projectDir: string, kind: string, id: string): HistoryControlTarget {
  if (report.kind !== 'skill-doctor-codex-benefit-report' || !report.projectDir || !existsSync(report.projectDir) || realpathSync(report.projectDir) !== realpathSync(projectDir) || !report.historyAnalysis) throw new Error('An offline report for this project is required.');
  if (kind === 'recommendations' && id === 'recommended_plugins') return { kind, id };
  const candidates = report.historyAnalysis.usageProfile.filter((item) => item.kind === kind && item.id === id);
  if (candidates.length !== 1) throw new Error('Candidate missing or ambiguous. Run the audit again.');
  const target = candidateControl(candidates[0]);
  if (!target) throw new Error('Independent control is unavailable; review plugin siblings or Skill source manually.');
  return target;
}

export function publicControlPreview(preview: HistoryControlPreview) {
  const { before, after, ...publicFields } = preview;
  return publicFields;
}

export function candidateControl(item: HistoryCandidate): HistoryControlTarget | undefined {
  if (item.kind === 'recommended_plugins') return { kind: 'recommendation', id: item.id };
  return undefined;
}

function projectConfig(projectDir: string, homeDir = homedir()): string {
  const project = realpathSync(resolve(projectDir));
  if (!existsSync(project) || !lstatSync(project).isDirectory()) throw new Error('Project directory is unavailable.');
  for (const path of [join(project, '.codex'), join(project, '.codex/config.toml'), join(project, '.codex/skill-doctor-operations')]) {
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error('Refusing a symlinked project configuration or operation directory.');
  }
  const config = join(project, '.codex/config.toml');
  const global = join(process.env.CODEX_HOME && homeDir === homedir() ? process.env.CODEX_HOME : join(homeDir, '.codex'), 'config.toml');
  const canonicalGlobal = existsSync(dirname(global)) ? join(realpathSync(dirname(global)), 'config.toml') : resolve(global);
  if (config === canonicalGlobal || (existsSync(global) && existsSync(config) && realpathSync(config) === realpathSync(global))) throw new Error('Project control must not write global Codex configuration.');
  return config;
}

// Edit only a canonical table/key, preserve unrelated text, then verify the entire
// parsed document against the intended change. Unsupported TOML layouts fail closed.
function setField(raw: string, table: string, key: string, value: unknown): string {
  const original = parseTOML<Config>(raw);
  const expected = structuredClone(original);
  expected[table] ??= {};
  expected[table][key] = value;
  const literal = Array.isArray(value)
    ? `[${value.map((entry) => `{ type = ${JSON.stringify(entry.type)}, id = ${JSON.stringify(entry.id)} }`).join(', ')}]`
    : JSON.stringify(value);
  const header = new RegExp(`^\\[${table}\\][ \\t]*(?:#.*)?$`, 'm').exec(raw);
  let next: string;
  if (!header) next = `${raw}\n[${table}]\n${key} = ${literal}\n`;
  else {
    const start = header.index + header[0].length;
    const boundary = /^\s*\[/m.exec(raw.slice(start + 1));
    const end = boundary ? start + 1 + boundary.index : raw.length;
    const block = raw.slice(start, end);
    const assignment = new RegExp(`^[ \\t]*${key}[ \\t]*=`, 'm').exec(block);
    if (!assignment) next = raw.slice(0, end).trimEnd() + `\n${key} = ${literal}\n` + raw.slice(end);
    else {
      const valueStart = assignment.index + assignment[0].length;
      let valueEnd = valueStart;
      let found = false;
      while (valueEnd < block.length) {
        const newline = block.indexOf('\n', valueEnd);
        valueEnd = newline < 0 ? block.length : newline + 1;
        try { parseTOML(`value = ${block.slice(valueStart, valueEnd)}`); found = true; break; } catch { /* multiline value */ }
      }
      if (!found) throw new Error('Unsupported TOML value; no configuration changed.');
      next = raw.slice(0, start + assignment.index) + `${key} = ${literal}\n` + raw.slice(start + valueEnd);
    }
  }
  if (!isDeepStrictEqual(parseTOML(next), expected)) throw new Error('Unsupported TOML layout; no configuration changed.');
  return next;
}

export function previewHistoryControl(projectDir: string, target: HistoryControlTarget, enabled: boolean, homeDir = homedir()): HistoryControlPreview {
  if (typeof enabled !== 'boolean' || !target || typeof target.id !== 'string') throw new Error('Invalid control request.');
  const configPath = projectConfig(projectDir, homeDir);
  projectDir = dirname(dirname(configPath));
  const globalConfig = join(process.env.CODEX_HOME && homeDir === homedir() ? process.env.CODEX_HOME : join(homeDir, '.codex'), 'config.toml');
  const before = read(configPath);
  const paths: string[] = [];
  for (let dir = dirname(resolve(projectDir)); ; dir = dirname(dir)) {
    paths.unshift(join(dir, '.codex/config.toml'));
    if (dirname(dir) === dir) break;
  }
  paths.unshift(globalConfig);
  const inherited = paths.filter((path, index) => path !== configPath && paths.indexOf(path) === index).map((path) => ({ path, text: read(path) }));
  const layers = [...inherited.map((item) => parseTOML<Config>(item.text)), parseTOML<Config>(before)];
  let after = before;
  if (target.kind === 'recommendations' && target.id === 'recommended_plugins') {
    after = setField(setField(before, 'features', 'tool_suggest', enabled), 'features', 'recommended_plugins', enabled);
  } else if (target.kind === 'recommendation') {
    if (!/^[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+$/.test(target.id)) throw new Error('Invalid recommendation plugin ID.');
    const entries = layers.reduce<any[]>((previous, layer) => layer.tool_suggest?.disabled_tools ?? previous, []);
    if (!Array.isArray(entries) || entries.some((item) => !item || !['plugin', 'connector'].includes(item.type) || typeof item.id !== 'string' || Object.keys(item).some((key) => !['type', 'id'].includes(key)))) throw new Error('Unsupported disabled_tools entries; no configuration changed.');
    const next = entries.filter((item) => !(item.type === 'plugin' && item.id === target.id));
    if (!enabled) next.push({ type: 'plugin', id: target.id });
    after = setField(before, 'tool_suggest', 'disabled_tools', next);
  } else if (target.kind === 'skill') {
    throw new Error('Project-level skills.config rules do not disable individual Codex skills. Use Codex user/session controls instead.');
  } else throw new Error('Unsupported control target.');
  const digest = hash(JSON.stringify({ projectDir: resolve(projectDir), target, enabled, before, after, inherited }));
  return { target, enabled, projectDir: resolve(projectDir), configPath, digest, before, after, changed: before !== after, scope: 'project', requiresNewSession: true,
    controlStatus: 'configured', runtimeVerified: false,
    verificationReason: 'Configuration preview/apply is not evidence that a Desktop session header changed; inspect a fresh task JSONL.',
    warnings: ['Project config must be trusted and loaded. Start a new session; runtime context savings are not verified.', 'Per-ID filtering may refill recommendations. Whole-block control also removes installation suggestions, not installed plugins.', 'Project array overrides inherit current entries; future parent-config changes may require review.'] };
}

export function applyHistoryControl(projectDir: string, target: HistoryControlTarget, enabled: boolean, confirmation: string, homeDir?: string) {
  const preview = previewHistoryControl(projectDir, target, enabled, homeDir);
  if (!confirmation || confirmation !== preview.digest) throw new Error('Preview is stale or confirmation is missing. Preview again.');
  const operationId = randomUUID();
  const dir = join(dirname(preview.configPath), 'skill-doctor-operations');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const lock = join(dir, 'write.lock');
  writeFileSync(lock, '', { flag: 'wx', mode: 0o600 });
  try {
    if (previewHistoryControl(projectDir, target, enabled, homeDir).digest !== confirmation) throw new Error('Configuration changed during confirmation.');
    writeFileSync(join(dir, `${operationId}.json`), JSON.stringify({ ...preview, existed: existsSync(preview.configPath) }), { flag: 'wx', mode: 0o600 });
    atomicWrite(preview.configPath, preview.after);
    if (read(preview.configPath) !== preview.after) throw new Error('Configuration verification failed.');
    return { operationId, configPath: preview.configPath, scope: 'project', changed: preview.changed, verified: 'config-only', controlStatus: preview.controlStatus, runtimeVerified: preview.runtimeVerified, verificationReason: preview.verificationReason, requiresNewSession: true };
  } finally { unlinkSync(lock); }
}

function atomicWrite(path: string, text: string): void {
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, text, { mode: 0o600, flag: 'wx' });
  renameSync(temp, path);
}

export function undoHistoryControl(projectDir: string, operationId: string, homeDir?: string) {
  if (!/^[0-9a-f-]{36}$/.test(operationId)) throw new Error('Invalid operation ID.');
  const configPath = projectConfig(projectDir, homeDir);
  const dir = join(dirname(configPath), 'skill-doctor-operations');
  const operation = JSON.parse(readFileSync(join(dir, `${operationId}.json`), 'utf8'));
  if (operation.configPath !== configPath || typeof operation.before !== 'string' || typeof operation.after !== 'string') throw new Error('Operation project mismatch.');
  const lock = join(dir, 'write.lock');
  writeFileSync(lock, '', { flag: 'wx', mode: 0o600 });
  try {
    if (read(configPath) !== operation.after) throw new Error('Configuration changed since this operation; refusing to overwrite subsequent edits.');
    if (operation.existed) atomicWrite(configPath, operation.before);
    else unlinkSync(configPath);
    return { operationId, configPath, restored: true, verified: 'config-only', controlStatus: 'configured', runtimeVerified: false, requiresNewSession: true };
  } finally { unlinkSync(lock); }
}
