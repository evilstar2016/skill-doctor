import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { isAbsolute, resolve } from 'node:path';

import { getContextSnapshotForResponse } from './contextEvidence';
import type { CatalogKind, CatalogSource, HistoryCandidate, HistoryTurn, OfflineHistoryAnalysis, OfflineHistoryInput } from './historyTypes';
import type { CodexContextStateSnapshot, CodexSessionScanResult, CodexSessionSelection } from './types';

export const CATALOG_KINDS: CatalogKind[] = ['skills_instructions', 'recommended_plugins'];
const hash = (text: string): string => createHash('sha256').update(text).digest('hex');
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown): string => typeof value === 'string' ? value : '';
const messageText = (value: Record<string, unknown>): string => typeof value.content === 'string' ? value.content : Array.isArray(value.content) ? value.content.map((part: unknown) => string(object(part).text)).join('\n') : string(value.message ?? value.text);

export function userMainSessions(scan: CodexSessionScanResult): CodexSessionSelection[] {
  const groups = new Map<string, CodexSessionSelection>();
  for (const item of scan.selected) {
    const { session } = item;
    if (session.parentThreadId || (session.threadSource && session.threadSource !== 'user') || /review|subagent/i.test(session.source ?? '')) continue;
    const previous = groups.get(session.sessionId);
    if (!previous) { groups.set(session.sessionId, item); continue; }
    const files = [...new Map([...previous.associatedFiles, ...item.associatedFiles].map((file) => [file.meta?.filePath, file])).values()];
    const usage = [...new Map([...previous.usage, ...item.usage].map((record) => [`${record.threadId}:${record.responseId}`, record])).values()];
    const snapshots = files.filter((file) => file.meta?.threadId === session.threadId).flatMap((file) => file.contextSnapshots);
    groups.set(session.sessionId, { ...previous, associatedFiles: files, usage, analysis: { ...previous.analysis, contextSnapshots: snapshots }, lastTimestamp: [previous.lastTimestamp ?? '', item.lastTimestamp ?? ''].sort().at(-1), firstTimestamp: [previous.firstTimestamp ?? session.timestamp, item.firstTimestamp ?? session.timestamp].sort()[0] });
  }
  return [...groups.values()];
}

export function catalogText(snapshot: CodexContextStateSnapshot, kind: CatalogKind): string | undefined {
  const block = snapshot.contextBlocks?.find((item) => item.id === kind);
  if (block) return block.complete && snapshot.contextBlocksComplete !== false ? block.text : undefined;
  if (kind === 'skills_instructions' && snapshot.hostSkillsComplete !== false && !snapshot.hostSkillsTruncated) return snapshot.hostSkillsText;
  return undefined;
}

export function catalogEntries(text: string, kind: CatalogKind): Array<{ name: string; id: string; sourcePath?: string; index: number }> {
  const roots = new Map(text.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*-\s+`([^`]+)`\s*=\s*`([^`]+)`/);
    return match ? [[match[1], match[2]] as const] : [];
  }));
  return text.split(/\r?\n/).flatMap((line, index) => {
    const match = kind === 'skills_instructions' ? line.match(/^\s*-\s+(.+?):\s+(.*)$/) : line.match(/^\s*-\s+(.+?)\s+\(([^()]+)\)\s*$/);
    if (!match) return [];
    const name = match[1].trim();
    const shortPath = kind === 'skills_instructions' ? match[2].match(/\(file:\s*([^\n]+?)\)\s*$/)?.[1] : undefined;
    const alias = shortPath?.match(/^([^/]+)\/(.*)$/);
    const sourcePath = shortPath && isAbsolute(shortPath) ? shortPath : alias && roots.has(alias[1]) ? resolve(roots.get(alias[1])!, alias[2]) : undefined;
    return [{ name, id: kind === 'recommended_plugins' ? match[2].trim() : name, index, ...(sourcePath ? { sourcePath } : {}) }];
  });
}

/** Recompute roots from retained catalog lines, never from today's local inventory. */
export function removeCatalogEntries(text: string, kind: CatalogKind, ids: Set<string>): string {
  const entries = catalogEntries(text, kind);
  const removed = new Set(entries.filter((entry) => ids.has(entry.id)).map((entry) => entry.index));
  if (!removed.size) return text;
  if (kind === 'recommended_plugins' && removed.size === entries.length) return '';
  const lines = text.split(/\r?\n/);
  if (kind === 'skills_instructions') {
    for (const [index, line] of lines.entries()) {
      const alias = line.match(/^\s*-\s+`([^`]+)`\s*=\s*`[^`]+`/);
      if (!alias) continue;
      const references = entries.filter((entry) => lines[entry.index].includes(`(file: ${alias[1]}/`));
      // Entries without paths may reference this root; preserve it in that case.
      if (references.length && references.every((entry) => removed.has(entry.index)) && entries.every((entry) => removed.has(entry.index) || /\(file:/.test(lines[entry.index]))) removed.add(index);
    }
  }
  return lines.filter((_line, index) => !removed.has(index)).join('\n');
}

function userText(text: string): string {
  text = text.replace(/>>>\s*TRANSCRIPT START[\s\S]*?(?:TRANSCRIPT END(?:\s*<<<)?|$)/gi, ' ');
  const request = text.lastIndexOf('## My request:');
  return (request >= 0 ? text.slice(request + '## My request:'.length) : text)
    .replace(/>>>\s*TRANSCRIPT START[\s\S]*?(?:TRANSCRIPT END(?:\s*<<<)?|$)/gi, ' ')
    .replace(/<([\w_-]+)(?:\s[^>]*)?>[\s\S]*?<\/\1>/g, ' ')
    .replace(/```[^]*?(?:```|$)|~~~[^]*?(?:~~~|$)/g, ' ')
    .replace(/^\s*>.*$/gm, ' ')
    .replace(/^# Files (?:pasted|mentioned) by the user:[\s\S]*$/gm, ' ');
}

function mentions(text: string, candidate: HistoryCandidate): boolean {
  return [candidate.id, candidate.sourcePath, ...(candidate.kind === 'recommended_plugins' && candidate.name.length > 3 ? [candidate.name] : [])].filter((term): term is string => Boolean(term)).some((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}_:/-])\\$?${escaped}(?=$|[^\\p{L}\\p{N}_:/-])`, 'iu').test(text);
  });
}

export async function collectHistoryInput(scan: CodexSessionScanResult, signal?: AbortSignal): Promise<OfflineHistoryInput> {
  signal?.throwIfAborted();
  const sessions = userMainSessions(scan).sort((a, b) => (b.lastTimestamp ?? b.session.timestamp).localeCompare(a.lastTimestamp ?? a.session.timestamp));
  const latest = sessions[0];
  const catalogs: OfflineHistoryInput['catalogs'] = [];
  for (const kind of CATALOG_KINDS) {
    const snapshot = [...(latest?.analysis.contextSnapshots ?? [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.line - a.line).find((item) => catalogText(item, kind) !== undefined);
    if (!snapshot) continue;
    const text = catalogText(snapshot, kind)!;
    const source: CatalogSource = { kind, sessionId: latest.session.sessionId, timestamp: snapshot.timestamp, sourcePath: snapshot.sourcePath, line: snapshot.line, sha256: hash(text) };
    catalogs.push({ source, text });
  }
  const profile: HistoryCandidate[] = catalogs.flatMap(({ source, text }) => catalogEntries(text, source.kind).map((entry) => ({ ...entry, kind: source.kind, explicitMentionCount: 0, activationCount: 0, observedReadCount: 0, usedSessionCount: 0, evidence: [], recommendation: 'review-disable', control: 'unverified', reason: 'No reliable use observed in the readable history; review before disabling.' } as HistoryCandidate)));
  const files = [...new Map(sessions.flatMap((session) => session.associatedFiles.filter((file) => file.meta && !/review|guardian|approval/i.test(file.meta.threadSource ?? '')).map((file) => [file.meta!.filePath, file] as const))).values()];
  files.sort((a, b) => a.meta!.timestamp.localeCompare(b.meta!.timestamp));
  const seen = new Set<string>();
  const used = new Map<HistoryCandidate, Set<string>>();
  const userCounts = new Map<string, number>();
  const userItems = new Map<string, Set<string>>();
  const completedTurns = new Map<string, Set<string>>();
  let incompleteFiles = 0;
  for (const file of files) {
    signal?.throwIfAborted();
    const meta = file.meta!;
    const boundary = scan.readBoundaries?.find((item) => item.filePath === meta.filePath);
    let incomplete = file.diagnostics.some((item) => /truncat|file_too_large|line_too_large|read_failed|invalid_json/i.test(item.code));
    let line = 0;
    let turnId = '';
    try {
      if (boundary?.readOffset === 0) { incompleteFiles += 1; continue; }
      const stream = createReadStream(meta.filePath, { encoding: 'utf8', ...(signal ? { signal } : {}), ...(boundary ? { end: boundary.readOffset - 1 } : {}) });
      const reader = createInterface({ input: stream, crlfDelay: Infinity });
      for await (const raw of reader) {
        line += 1;
        if (!raw.trim()) continue;
        let row: Record<string, unknown>;
        try { row = JSON.parse(raw); } catch { incomplete = true; continue; }
        const payload = object(row.payload);
        if (row.type === 'turn_context' || payload.turn_id) turnId = string(payload.turn_id) || turnId;
        const item = payload.item ? object(payload.item) : payload;
        const type = String(item.type ?? '').toLowerCase().replace(/_/g, '');
        const timestamp = typeof row.timestamp === 'string' ? row.timestamp : meta.timestamp;
        if (Date.parse(timestamp) < scan.sinceMs || Date.parse(timestamp) > scan.untilMs) continue;
        if (payload.type === 'item_started') continue;
        if (payload.type === 'turn_completed' || payload.type === 'task_complete') {
          const turns = completedTurns.get(meta.threadId) ?? new Set<string>();
          turns.add(turnId || `${meta.filePath}:${line}`); completedTurns.set(meta.threadId, turns);
        }
        const isUser = type === 'usermessage' || (row.type === 'response_item' && item.type === 'message' && item.role === 'user');
        const text = isUser ? messageText(item) : '';
        if (item.type === 'UserMessage') {
          const ids = userItems.get(meta.threadId) ?? new Set<string>();
          ids.add(string(item.id) || `${turnId}:${hash(text)}`); userItems.set(meta.threadId, ids);
        }
        const key = isUser ? `user:${turnId || timestamp}:${hash(userText(text).replace(/\s+/g, ' ').trim())}` : `item:${item.id ?? item.call_id ?? `${meta.threadId}:${line}`}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (isUser && userText(text).trim()) userCounts.set(meta.threadId, (userCounts.get(meta.threadId) ?? 0) + 1);
        const structuredSkills = Array.isArray(item.content) ? item.content.filter((part: unknown) => object(part).type === 'skill') : [];
        const activationText = type === 'skill' || type === 'skillactivation' ? `${item.name ?? ''} ${item.path ?? ''}` : structuredSkills.map((part: unknown) => `${object(part).name ?? ''} ${object(part).path ?? ''}`).join('\n');
        // Only metadata or selected skill wrappers, never tool results, is activation evidence.
        const skillWrapper = isUser && !text.includes('TRANSCRIPT START') ? text.match(/<skill>[^]*?<\/skill>/g)?.join('\n') ?? '' : '';
        const command = /commandexecution|functioncall|customtoolcall/.test(type) ? JSON.stringify(item.command ?? item.arguments ?? item.input ?? '') : '';
        for (const candidate of profile) {
          const mention = isUser && mentions(userText(text), candidate);
          const activation = mentions(`${activationText}\n${skillWrapper}`, candidate) || (candidate.kind === 'recommended_plugins' && item.plugin_id === candidate.id && /toolcall|functioncall/.test(type));
          const read = candidate.sourcePath !== undefined && command.includes(candidate.sourcePath) && /\b(cat|sed|head|read_file|readFile)\b/.test(command);
          if (!mention && !activation && !read) continue;
          if (mention) candidate.explicitMentionCount += 1;
          if (activation) candidate.activationCount += 1;
          if (read) candidate.observedReadCount += 1;
          candidate.evidence.push({ sessionId: meta.sessionId, sourcePath: meta.filePath, line, kind: mention ? 'mention' : activation ? 'activation' : 'read' });
          if (mention || activation) {
            const set = used.get(candidate) ?? new Set<string>();
            set.add(meta.sessionId); used.set(candidate, set);
            candidate.lastUsedAt = !candidate.lastUsedAt || timestamp > candidate.lastUsedAt ? timestamp : candidate.lastUsedAt;
          }
        }
      }
    } catch { signal?.throwIfAborted(); incomplete = true; }
    if (incomplete) incompleteFiles += 1;
  }
  const limited = scan.sinceMs > 0 || scan.skipped.some((item) => item.reason === 'limit-exceeded') || scan.diagnostics.some((item) => /limit|truncat/i.test(item.code));
  for (const candidate of profile) {
    candidate.usedSessionCount = used.get(candidate)?.size ?? 0;
    const duplicate = profile.filter((other) => other.kind === candidate.kind && other.id === candidate.id).length > 1;
    candidate.recommendation = candidate.usedSessionCount ? 'retain' : incompleteFiles || !files.length || duplicate ? 'unknown' : 'review-disable';
    candidate.reason = candidate.usedSessionCount ? 'Reliable historical use; retained.' : candidate.recommendation === 'unknown' ? 'History is incomplete or identity is ambiguous; absence of use is unknown.' : candidate.reason;
  }
  profile.sort((a, b) => b.usedSessionCount - a.usedSessionCount || b.explicitMentionCount - a.explicitMentionCount || a.name.localeCompare(b.name));
  const analysis: OfflineHistoryAnalysis = {
    mode: 'latest-catalog-projection',
    assumption: 'Latest complete catalog deletion is projected onto the longest main-session workload, assuming descriptions remain visible for every response. This is hypothetical, not realized savings. Cache attribution is a bounded scenario, not measured block-level cache hits.',
    historyCoverage: { since: new Date(scan.sinceMs).toISOString(), until: new Date(scan.untilMs).toISOString(), sessionCount: sessions.length, fileCount: files.length, includesArchived: scan.sessionRoots.some((root) => root.endsWith('archived_sessions')), limited, incompleteFiles, userMessages: [...userCounts.values()].reduce((a, b) => a + b, 0) },
    catalogSources: catalogs.map(({ source }) => source), usageProfile: profile,
    childUsage: { responseCount: 0, inputTokens: 0, cachedInputTokens: 0 }, blockDeltas: {},
    pluginControl: { perId: 'tool_suggest.disabled_tools += {type="plugin", id=…} (merge existing connector/plugin entries)', wholeBlock: 'features.tool_suggest=false AND features.recommended_plugins=false', runtimeVerified: false, replacementRisk: true, wholeBlockSelected: false, impact: 'Whole-block control also disables model-side plugin installation suggestions, not installed plugins or apps. Per-ID filtering can refill from unseen candidates (render limit 50); text deltas are not verified runtime savings.' },
    turnBreakdown: [], responses: [], historicalReplay: { inputTokens: 0, coveredResponses: 0, unknownResponses: 0 },
  };
  const baseline = [...sessions].sort((a, b) => mainResponses(b).length - mainResponses(a).length || (b.lastTimestamp ?? '').localeCompare(a.lastTimestamp ?? ''))[0];
  if (baseline) {
    analysis.baselineSession = { sessionId: baseline.session.sessionId, sourcePath: baseline.session.filePath, firstTimestamp: baseline.session.timestamp, lastTimestamp: baseline.lastTimestamp, rule: 'Most complete main-thread model responses; newest activity breaks ties; system/reviewer sessions excluded.', userMessageCount: userCounts.get(baseline.session.threadId) ?? 0, userMessageItemCount: userItems.get(baseline.session.threadId)?.size ?? 0, distinctTurnCount: new Set(mainResponses(baseline).flatMap((record) => record.turnId ? [record.turnId] : [])).size, completedTurnCount: completedTurns.get(baseline.session.threadId)?.size ?? 0, responseCount: mainResponses(baseline).length };
    const children = baseline.usage.filter((record) => record.threadId !== baseline.session.threadId && record.quality === 'complete');
    analysis.childUsage = { responseCount: children.length, inputTokens: children.reduce((sum, item) => sum + item.usage.inputTokens, 0), cachedInputTokens: children.reduce((sum, item) => sum + item.usage.cachedInputTokens, 0) };
  }
  return { analysis, catalogs };
}

function mainResponses(selection: CodexSessionSelection) {
  return selection.usage.filter((record) => record.quality === 'complete' && record.threadId === selection.session.threadId);
}

export function projectHistory(input: OfflineHistoryInput, scan: CodexSessionScanResult, count: (text: string) => number): OfflineHistoryAnalysis {
  const counts = new Map<string, number>();
  const rawCount = count;
  count = (text) => {
    if (!counts.has(text)) counts.set(text, rawCount(text));
    return counts.get(text)!;
  };
  const analysis: OfflineHistoryAnalysis = { ...input.analysis, blockDeltas: {}, responses: [], turnBreakdown: [], historicalReplay: { inputTokens: 0, coveredResponses: 0, unknownResponses: 0 } };
  const selected = (kind: CatalogKind) => new Set(analysis.usageProfile.filter((item) => item.kind === kind && item.recommendation === 'review-disable').map((item) => item.id));
  for (const { source, text } of input.catalogs) analysis.blockDeltas[source.kind] = Math.max(0, count(text) - count(removeCatalogEntries(text, source.kind, selected(source.kind))));
  const delta = input.catalogs.length ? Object.values(analysis.blockDeltas).reduce((a, b) => a + b, 0) : undefined;
  analysis.descriptionTokensPerResponse = delta;
  analysis.pluginControl = { ...analysis.pluginControl, wholeBlockSelected: input.catalogs.some(({ source, text }) => source.kind === 'recommended_plugins' && catalogEntries(text, source.kind).length > 0 && removeCatalogEntries(text, source.kind, selected(source.kind)) === '') };
  const baseline = userMainSessions(scan).find((item) => item.session.sessionId === analysis.baselineSession?.sessionId);
  if (!baseline) return analysis;
  const turns = new Map<string, HistoryTurn>();
  for (const record of mainResponses(baseline).sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.line - b.line)) {
    const { inputTokens: I, cachedInputTokens: C, cacheWriteInputTokens: W } = record.usage;
    const D = delta !== undefined && delta <= I && C + W <= I ? delta : undefined;
    const snapshot = getContextSnapshotForResponse(baseline, record);
    let replay = 0;
    let known = true;
    for (const kind of CATALOG_KINDS) {
      if (!selected(kind).size) continue;
      const text = snapshot ? catalogText(snapshot, kind) : undefined;
      if (text === undefined) { known = false; continue; }
      replay += Math.max(0, count(text) - count(removeCatalogEntries(text, kind, selected(kind))));
    }
    known &&= replay <= I && input.catalogs.length > 0;
    const row = { responseId: record.responseId, turnId: record.turnId, timestamp: record.timestamp, model: record.model, before: record.usage, descriptionTokens: D, ...(known ? { replayTokens: replay } : {}), ...(D !== undefined ? { cacheAttribution: { lower: Math.max(0, D - (I - C)), upper: Math.min(D, C), cachedRead: Math.min(D, C), cacheWrite: Math.min(D - Math.min(D, C), W), ordinary: D - Math.min(D, C) - Math.min(D - Math.min(D, C), W) } } : {}) };
    analysis.responses.push(row);
    analysis.historicalReplay.inputTokens += known ? replay : 0;
    analysis.historicalReplay[known ? 'coveredResponses' : 'unknownResponses'] += 1;
    const key = record.turnId ?? `unknown:${record.responseId}`;
    const turn = turns.get(key) ?? { turnId: key, responseCount: 0, inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, descriptionTokens: 0, unknownResponses: 0, cachedReadSavings: 0, cacheWriteSavings: 0, ordinarySavings: 0 };
    turn.responseCount += 1; turn.inputTokens += I; turn.cachedInputTokens += C; turn.cacheWriteInputTokens += W; turn.descriptionTokens += D ?? 0; turn.unknownResponses += D === undefined ? 1 : 0;
    turn.cachedReadSavings += row.cacheAttribution?.cachedRead ?? 0;
    turn.cacheWriteSavings += row.cacheAttribution?.cacheWrite ?? 0;
    turn.ordinarySavings += row.cacheAttribution?.ordinary ?? 0;
    turns.set(key, turn);
  }
  analysis.turnBreakdown = [...turns.values()];
  analysis.firstResponse = analysis.responses[0];
  analysis.firstInteraction = analysis.firstResponse?.turnId ? turns.get(analysis.firstResponse.turnId) : undefined;
  return analysis;
}
