import { createHash } from 'node:crypto';
import { createReadStream, realpathSync } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';

import { analyzeCodexContextBlocks, CODEX_CONTEXT_BLOCK_IDS } from '../context/scanCodexContextBlocks';
import { createTokenCounter } from '../context/tokenCounter';
import { defaultSessionIndexPath, indexEntryMatches, loadSessionIndex, pruneSessionIndexEntries, sanitizeAnalysisForIndex, saveSessionIndex, type SessionIndexEntry } from './sessionIndex';
import type {
  BenefitDiagnostic,
  BenefitRecordStatus,
  CodexContextBlockSnapshot,
  CodexContextStateSnapshot,
  CodexEventSummary,
  CodexModelContext,
  CodexSessionFileAnalysis,
  CodexSessionMetaRecord,
  CodexSessionScanOptions,
  CodexSessionScanResult,
  CodexSessionSelection,
  CodexSessionUsageSummary,
  CodexUsage,
  CodexUsageRecord,
} from './types';
import type { CodexContextBlockAnalysis, CodexContextBlockId, CodexContextBlockObservation, CodexContextBlockVerification, CodexContextEvidenceLevel, CodexContextProvenance } from '../types/context';

const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_FILE_BYTES = 128 * 1024 * 1024;
const DEFAULT_MAX_LINE_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5000;
const DEFAULT_MAX_DEPTH = 12;
const USAGE_FIELDS = [
  'input_tokens',
  'cached_input_tokens',
  'cache_write_input_tokens',
  'output_tokens',
  'reasoning_output_tokens',
  'total_tokens',
] as const;

interface ParsedLine {
  line: number;
  value: Record<string, unknown>;
}

interface PendingTokenCount {
  line: number;
  timestamp: string;
  threadId?: string;
  turnId?: string;
  totalUsage?: Record<string, unknown>;
  lastUsage?: Record<string, unknown>;
  contextSnapshotLine?: number;
  contextSnapshotLines?: number[];
  contextSnapshotTimestamp?: string;
}

interface MutableAnalysis {
  meta?: CodexSessionMetaRecord;
  usageRecords: CodexUsageRecord[];
  tokenCounts: PendingTokenCount[];
  modelContexts: CodexModelContext[];
  contextSnapshots: CodexContextStateSnapshot[];
  cwdCandidates: string[];
  workspaceRoots: string[];
  observedEventTypes: Set<string>;
  currentAgentsText?: string;
  currentAgentsDirectory?: string;
  currentAgentsTruncated?: boolean;
  currentAgentsComplete?: boolean;
  currentHostSkillsText?: string;
  currentHostSkillsTruncated?: boolean;
  currentHostSkillsComplete?: boolean;
  currentContextBlocks: Map<string, CodexContextBlockSnapshot>;
  currentContextBlockLines: Map<string, number>;
  contextSnapshotValid: boolean;
  contextSnapshotAwaitingFull: boolean;
  events: CodexEventSummary;
  firstTimestamp?: string;
  lastTimestamp?: string;
  status: BenefitRecordStatus;
  diagnostics: BenefitDiagnostic[];
  bytes: number;
  lineCount: number;
  archived: boolean;
}

interface CollectJsonlOptions extends Required<Pick<CodexSessionScanOptions, 'maxFileBytes' | 'maxLineBytes'>> {
  includeContext?: boolean;
  exactProjectDir?: string;
  startOffset?: number;
  baseAnalysis?: CodexSessionFileAnalysis;
  signal?: AbortSignal;
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const error = new Error('Codex session scan cancelled');
  error.name = 'AbortError';
  throw error;
}

function emptyEvents(): CodexEventSummary {
  return {
    itemTypes: {},
    toolCalls: 0,
    commandExecutions: 0,
    fileChanges: 0,
    mcpCalls: 0,
    compactions: 0,
    completedTurns: 0,
    failedTurns: 0,
    cancelledTurns: 0,
  };
}

function diagnostic(
  code: string,
  severity: BenefitDiagnostic['severity'],
  message: string,
  filePath?: string,
  line?: number,
): BenefitDiagnostic {
  return {
    code,
    severity,
    message,
    ...(filePath ? { sourcePath: filePath } : {}),
    ...(line ? { line } : {}),
  };
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function hasEmbeddedUsage(value: Record<string, unknown> | undefined): boolean {
  if (!value) return false;
  const candidates = [value.usage, value.token_usage, objectValue(value.info)?.total_token_usage, objectValue(value.info)?.last_token_usage];
  return candidates.some((candidate) => Boolean(objectValue(candidate)));
}

function parseTimestamp(value: unknown): string | undefined {
  const timestamp = stringValue(value);
  if (!timestamp) return undefined;
  const millis = Date.parse(timestamp);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : undefined;
}

function addTimestamp(analysis: MutableAnalysis, timestamp: string | undefined): void {
  if (!timestamp) return;
  if (!analysis.firstTimestamp || timestamp < analysis.firstTimestamp) analysis.firstTimestamp = timestamp;
  if (!analysis.lastTimestamp || timestamp > analysis.lastTimestamp) analysis.lastTimestamp = timestamp;
}

function normalizeUsage(raw: Record<string, unknown> | undefined): { usage?: CodexUsage; missing: string[] } {
  if (!raw) return { missing: [...USAGE_FIELDS] };
  const missing = USAGE_FIELDS.filter((field) => numberValue(raw[field]) === undefined);
  return {
    usage: {
      inputTokens: numberValue(raw.input_tokens) ?? 0,
      cachedInputTokens: numberValue(raw.cached_input_tokens) ?? 0,
      cacheWriteInputTokens: numberValue(raw.cache_write_input_tokens) ?? 0,
      outputTokens: numberValue(raw.output_tokens) ?? 0,
      reasoningOutputTokens: numberValue(raw.reasoning_output_tokens) ?? 0,
      totalTokens: numberValue(raw.total_tokens) ?? 0,
    },
    missing: [...missing],
  };
}

function usageComparison(
  primary: CodexUsage,
  secondary: CodexUsage | undefined,
  label: 'turn' | 'thread',
): 'equal' | 'different' | 'unavailable' | 'not_comparable' {
  if (!secondary) return 'unavailable';
  if (primary.totalTokens === secondary.totalTokens) return 'equal';
  return label === 'thread' ? 'not_comparable' : 'different';
}

function sourceString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  const object = objectValue(value);
  if (!object) return undefined;
  const subagent = objectValue(object.subagent);
  if (subagent?.other && typeof subagent.other === 'string') return `subagent:${subagent.other}`;
  return undefined;
}

function sessionMetaFrom(value: Record<string, unknown>, filePath: string, archived: boolean): CodexSessionMetaRecord | undefined {
  const payload = objectValue(value.payload);
  if (!payload) return undefined;
  const threadId = stringValue(payload.id);
  const sessionId = stringValue(payload.session_id) ?? threadId;
  const timestamp = parseTimestamp(value.timestamp) ?? parseTimestamp(payload.timestamp);
  if (!threadId || !sessionId || !timestamp) return undefined;
  const contextWindow = numberValue(objectValue(payload.context_window)?.value)
    ?? numberValue(payload.context_window);
  return {
    filePath,
    sessionId,
    threadId,
    ...(stringValue(payload.parent_thread_id) ? { parentThreadId: payload.parent_thread_id as string } : {}),
    timestamp,
    ...(stringValue(payload.cwd) ? { cwd: payload.cwd as string } : {}),
    ...(stringValue(payload.originator) ? { originator: payload.originator as string } : {}),
    ...(stringValue(payload.cli_version) ? { cliVersion: payload.cli_version as string } : {}),
    ...(sourceString(payload.source) ? { source: sourceString(payload.source) } : {}),
    ...(stringValue(payload.thread_source) ? { threadSource: payload.thread_source as string } : {}),
    ...(stringValue(payload.model_provider) ? { modelProvider: payload.model_provider as string } : {}),
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    archived,
  };
}

function usageRecordFrom(
  value: Record<string, unknown>,
  filePath: string,
  line: number,
  archived: boolean,
  modelByTurn: Map<string, CodexModelContext>,
  contextSnapshot: CodexContextStateSnapshot | undefined,
  contextSnapshotLines: number[] = [],
): CodexUsageRecord | undefined {
  const payload = objectValue(value.payload);
  if (!payload) return undefined;
  const rawUsage = objectValue(payload.usage);
  const normalized = normalizeUsage(rawUsage);
  if (!normalized.usage) return undefined;
  const threadId = stringValue(payload.thread_id) ?? stringValue(payload.session_id);
  const sessionId = stringValue(payload.session_id) ?? threadId;
  const responseId = stringValue(payload.response_id);
  const timestamp = parseTimestamp(value.timestamp);
  if (!threadId || !sessionId || !responseId || !timestamp) return undefined;
  const turnId = stringValue(payload.turn_id);
  const context = turnId ? modelByTurn.get(turnId) : undefined;
  const turnUsage = normalizeUsage(objectValue(payload.turn_token_usage)).usage;
  const threadUsage = normalizeUsage(objectValue(payload.thread_token_usage)).usage;
  return {
    responseId,
    sessionId,
    threadId,
    ...(stringValue(payload.root_turn_id) ? { rootTurnId: payload.root_turn_id as string } : {}),
    ...(turnId ? { turnId } : {}),
    timestamp,
    usage: normalized.usage,
    ...(turnUsage ? { turnUsage } : {}),
    ...(threadUsage ? { threadUsage } : {}),
    ...(context?.cwd ? { cwd: context.cwd } : {}),
    usageValidation: {
      turn: usageComparison(normalized.usage, turnUsage, 'turn'),
      thread: usageComparison(normalized.usage, threadUsage, 'thread'),
      ...(threadUsage && normalized.usage.totalTokens !== threadUsage.totalTokens
        ? { reason: 'thread_token_usage may be a cumulative thread value and is not summed with the response value' }
        : {}),
    },
    ...(context?.model ? { model: context.model } : {}),
    ...(context?.effort ? { effort: context.effort } : {}),
    sourcePath: filePath,
    line,
    ...(contextSnapshot ? { contextSnapshotLine: contextSnapshot.line, contextSnapshotTimestamp: contextSnapshot.timestamp } : {}),
    ...(contextSnapshotLines.length > 0 ? { contextSnapshotLines: [...contextSnapshotLines] } : {}),
    archived,
    sourceKind: 'token_usage_record',
    quality: normalized.missing.length === 0 ? 'complete' : 'partial',
  };
}

function tokenCountRecordFrom(
  pending: PendingTokenCount,
  filePath: string,
  archived: boolean,
  index: number,
  meta: CodexSessionMetaRecord | undefined,
  modelByTurn: Map<string, CodexModelContext>,
): CodexUsageRecord | undefined {
  const normalized = normalizeUsage(pending.lastUsage ?? pending.totalUsage);
  if (!normalized.usage) return undefined;
  const threadId = pending.threadId ?? meta?.threadId;
  const sessionId = meta?.sessionId ?? threadId;
  if (!threadId || !sessionId) return undefined;
  const context = pending.turnId ? modelByTurn.get(pending.turnId) : undefined;
  return {
    responseId: `token-count:${threadId}:${pending.line}:${index}`,
    sessionId,
    threadId,
    ...(pending.turnId ? { turnId: pending.turnId } : {}),
    timestamp: pending.timestamp,
    usage: normalized.usage,
    ...(context?.cwd ? { cwd: context.cwd } : meta?.cwd ? { cwd: meta.cwd } : {}),
    ...(context?.model ? { model: context.model } : {}),
    ...(context?.effort ? { effort: context.effort } : {}),
    sourcePath: filePath,
    line: pending.line,
    ...(pending.contextSnapshotLine !== undefined
      ? { contextSnapshotLine: pending.contextSnapshotLine, ...(pending.contextSnapshotTimestamp ? { contextSnapshotTimestamp: pending.contextSnapshotTimestamp } : {}) }
      : {}),
    ...(pending.contextSnapshotLines && pending.contextSnapshotLines.length > 0 ? { contextSnapshotLines: [...pending.contextSnapshotLines] } : {}),
    archived,
    sourceKind: 'token_count',
    quality: 'partial',
  };
}

function addItemEvent(analysis: MutableAnalysis, item: Record<string, unknown>): void {
  const type = stringValue(item.type) ?? 'unknown';
  analysis.events.itemTypes[type] = (analysis.events.itemTypes[type] ?? 0) + 1;
  const normalized = type.toLowerCase();
  if (normalized.includes('commandexecution')) analysis.events.commandExecutions += 1;
  if (normalized.includes('filechange')) analysis.events.fileChanges += 1;
  if (normalized.includes('mcptoolcall')) analysis.events.mcpCalls += 1;
  if (normalized.includes('toolcall') || normalized === 'functioncall' || normalized === 'custom_tool_call') {
    analysis.events.toolCalls += 1;
  }
}

function addTurnEvent(analysis: MutableAnalysis, payload: Record<string, unknown>): void {
  const type = stringValue(payload.type);
  if (type === 'task_complete' || type === 'turn_completed') {
    analysis.events.completedTurns += 1;
    const duration = numberValue(payload.duration_ms);
    const firstToken = numberValue(payload.time_to_first_token_ms);
    if (duration !== undefined) analysis.events.durationMs = (analysis.events.durationMs ?? 0) + duration;
    if (firstToken !== undefined) analysis.events.timeToFirstTokenMs = (analysis.events.timeToFirstTokenMs ?? 0) + firstToken;
  } else if (type === 'task_failed' || type === 'turn_failed') {
    analysis.events.failedTurns += 1;
  } else if (type === 'task_cancelled' || type === 'turn_cancelled' || type === 'turn_interrupted') {
    analysis.events.cancelledTurns += 1;
  } else if (type === 'item_completed') {
    const item = objectValue(payload.item);
    if (item) addItemEvent(analysis, item);
  } else if (type === 'token_count') {
    const info = objectValue(payload.info);
    analysis.tokenCounts.push({
      line: 0,
      timestamp: '',
      totalUsage: objectValue(info?.total_token_usage),
      lastUsage: objectValue(info?.last_token_usage),
    });
  }
}

function hashText(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  return createHash('sha256').update(text).digest('hex');
}

function contextRole(value: unknown): 'developer' | 'user' | 'unknown' {
  return value === 'developer' || value === 'user' ? value : 'unknown';
}

function responseItemText(payload: Record<string, unknown>): string {
  const content = payload.content;
  const values = Array.isArray(content) ? content : [content];
  return values.flatMap((item) => {
    if (typeof item === 'string') return [item];
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const text = (item as Record<string, unknown>).text;
    return typeof text === 'string' ? [text] : [];
  }).join('\n');
}

interface ResponseItemContextPart {
  text: string;
  contentItemKind?: string;
  contentItemIndex?: number;
  blockIds?: CodexContextBlockId[];
  evidenceLevel: CodexContextEvidenceLevel;
}

const CONTEXT_BLOCKS_BY_ITEM_KIND: Record<string, CodexContextBlockId[]> = {
  'host_skills.instructions': ['skills_instructions'],
  'plugins.recommendations': ['recommended_plugins'],
  'permissions.instructions': ['permissions_instructions'],
  'collaboration_mode.instructions': ['collaboration_mode'],
  'apps.instructions': ['apps_instructions'],
  'plugins.usage_instructions': ['plugins_instructions'],
  'environments.environment_context': ['environment_context'],
  'generic.developer_instructions': ['app_context'],
};

function responseItemContentParts(payload: Record<string, unknown>): ResponseItemContextPart[] {
  const content = payload.content;
  const values = Array.isArray(content) ? content : [content];
  const texts = values.map((item, index) => ({
    index,
    text: typeof item === 'string'
      ? item
      : item && typeof item === 'object' && !Array.isArray(item) && typeof (item as Record<string, unknown>).text === 'string'
        ? (item as Record<string, unknown>).text as string
        : '',
  }));
  const passthrough = objectValue(payload.internal_chat_message_metadata_passthrough);
  const kinds = Array.isArray(passthrough?.content_item_kinds)
    && passthrough.content_item_kinds.every((item) => typeof item === 'string')
    ? passthrough.content_item_kinds as string[]
    : undefined;

  if (!kinds) {
    const text = responseItemText(payload);
    return text ? [{ text, evidenceLevel: 'text-observed' }] : [];
  }

  return texts.flatMap(({ index, text }) => {
    if (!text) return [];
    const kind = kinds[index];
    const blockIds = kind ? CONTEXT_BLOCKS_BY_ITEM_KIND[kind] : undefined;
    if (!kind || !blockIds) return [];
    return [{ text, contentItemKind: kind, contentItemIndex: index, blockIds, evidenceLevel: 'runtime-item-observed' }];
  });
}

function contextBlockSnapshotFrom(
  block: ReturnType<typeof analyzeCodexContextBlocks>['blocks'][number],
  sourcePath: string,
  line: number,
): CodexContextBlockSnapshot {
  return {
    id: block.id,
    tag: block.tag,
    role: block.role,
    ...(block.contentKind ? { contentKind: block.contentKind } : {}),
    activation: block.activation,
    complete: block.complete,
    estimatedChars: block.estimatedChars,
    estimatedTokens: block.estimatedTokens,
    text: block.text,
    ...(hashText(block.text) ? { textSha256: hashText(block.text) } : {}),
    ...(block.rootAliases ? { rootAliases: block.rootAliases } : {}),
    ...(block.availableSkills ? { availableSkills: block.availableSkills } : {}),
    ...(block.recommendedPlugins ? { recommendedPlugins: block.recommendedPlugins } : {}),
    ...(block.controlMethod ? { controlMethod: block.controlMethod } : {}),
    ...(block.controllable !== undefined ? { controllable: block.controllable } : {}),
    ...(block.controlStatus ? { controlStatus: block.controlStatus } : {}),
    ...(block.evidenceLevel ? { evidenceLevel: block.evidenceLevel } : {}),
    ...(block.provenance ? { provenance: block.provenance } : {}),
    recommendation: block.recommendation,
    sourcePath,
    line,
  };
}

function currentContextSnapshotLines(analysis: MutableAnalysis): number[] {
  if (!analysis.contextSnapshotValid) return [];
  const lines = new Set<number>(analysis.currentContextBlockLines.values());
  const latestWorldState = [...analysis.contextSnapshots].reverse().find((snapshot) => snapshot.sourceKind === 'world_state' || snapshot.sourceKind === undefined);
  if (latestWorldState && (
    latestWorldState.agentsText !== undefined
    || latestWorldState.hostSkillsText !== undefined
    || latestWorldState.agentsTextChars !== undefined
    || latestWorldState.hostSkillsTextChars !== undefined
  )) lines.add(latestWorldState.line);
  return [...lines].sort((left, right) => left - right);
}

function latestContextSnapshot(analysis: MutableAnalysis, lines: number[]): CodexContextStateSnapshot | undefined {
  const line = lines.at(-1);
  return line === undefined ? undefined : [...analysis.contextSnapshots].reverse().find((snapshot) => snapshot.line === line);
}

function addContextRecord(
  analysis: MutableAnalysis,
  value: Record<string, unknown>,
  filePath: string,
  line: number,
  timestamp: string,
): void {
  const payload = objectValue(value.payload);
  if (!payload) return;
  if (stringValue(value.type) === 'world_state') {
    const state = objectValue(payload.state);
    if (!state) return;
    const full = payload.full === true;
    if (full) {
      analysis.currentAgentsText = undefined;
      analysis.currentAgentsDirectory = undefined;
      analysis.currentAgentsTruncated = undefined;
      analysis.currentAgentsComplete = undefined;
      analysis.currentHostSkillsText = undefined;
      analysis.currentHostSkillsTruncated = undefined;
      analysis.currentHostSkillsComplete = undefined;
      analysis.currentContextBlocks.clear();
      analysis.currentContextBlockLines.clear();
      analysis.contextSnapshotAwaitingFull = false;
      analysis.contextSnapshotValid = true;
    } else if (analysis.contextSnapshotAwaitingFull) {
      analysis.contextSnapshotValid = false;
    } else {
      analysis.contextSnapshotValid = true;
    }
    const agents = objectValue(state.agents_md);
    const hostSkills = objectValue(state.host_skills);
    if (state.agents_md === null) {
      analysis.currentAgentsText = undefined;
      analysis.currentAgentsDirectory = undefined;
      analysis.currentAgentsTruncated = undefined;
      analysis.currentAgentsComplete = undefined;
    } else if (agents) {
      analysis.currentAgentsText = stringValue(agents.text);
      analysis.currentAgentsDirectory = stringValue(agents.directory);
      analysis.currentAgentsTruncated = booleanValue(agents.truncated);
      analysis.currentAgentsComplete = booleanValue(agents.complete);
    }
    if (state.host_skills === null) {
      analysis.currentHostSkillsText = undefined;
      analysis.currentHostSkillsTruncated = undefined;
      analysis.currentHostSkillsComplete = undefined;
    } else if (hostSkills) {
      analysis.currentHostSkillsText = stringValue(hostSkills.body);
      analysis.currentHostSkillsTruncated = booleanValue(hostSkills.truncated);
      analysis.currentHostSkillsComplete = booleanValue(hostSkills.complete);
    }
    const workspaceRoots = Array.isArray(state.workspace_roots)
      ? state.workspace_roots.filter((item): item is string => typeof item === 'string')
      : [];
    analysis.workspaceRoots.push(...workspaceRoots);
    const snapshot: CodexContextStateSnapshot = {
      timestamp,
      full,
      sourceKind: 'world_state',
      stateKeys: Object.keys(state).sort(),
      ...(analysis.currentAgentsText ? { agentsText: analysis.currentAgentsText } : {}),
      ...(analysis.currentAgentsDirectory ? { agentsDirectory: analysis.currentAgentsDirectory } : {}),
      ...(analysis.currentAgentsText ? { agentsTextChars: analysis.currentAgentsText.length } : {}),
      ...(analysis.currentAgentsTruncated !== undefined ? { agentsTruncated: analysis.currentAgentsTruncated } : {}),
      ...(analysis.currentAgentsComplete !== undefined ? { agentsComplete: analysis.currentAgentsComplete } : {}),
      ...(analysis.currentHostSkillsText ? { hostSkillsText: analysis.currentHostSkillsText } : {}),
      ...(analysis.currentHostSkillsText ? { hostSkillsTextChars: analysis.currentHostSkillsText.length } : {}),
      ...(analysis.currentHostSkillsTruncated !== undefined ? { hostSkillsTruncated: analysis.currentHostSkillsTruncated } : {}),
      ...(analysis.currentHostSkillsComplete !== undefined ? { hostSkillsComplete: analysis.currentHostSkillsComplete } : {}),
      sourcePath: filePath,
      line,
    };
    analysis.contextSnapshots.push(snapshot);
    return;
  }

  if (stringValue(value.type) === 'response_item') {
    const role = contextRole(payload.role);
    if (role === 'unknown') return;
    const parts = responseItemContentParts(payload);
    if (parts.length === 0) return;
    if (analysis.contextSnapshotAwaitingFull) {
      analysis.diagnostics.push(diagnostic('context.response_item_awaiting_full_snapshot', 'warning', 'Ignored response-item context blocks after compaction until a full world_state snapshot appears', filePath, line));
      return;
    }
    analysis.contextSnapshotValid = true;
    const parsedParts = parts.map((part) => {
      const provenance: CodexContextProvenance = {
        sourcePath: filePath,
        line,
        role,
        ...(part.contentItemKind ? { contentItemKind: part.contentItemKind } : {}),
        ...(part.contentItemIndex !== undefined ? { contentItemIndex: part.contentItemIndex } : {}),
        ...(analysis.meta?.sessionId ? { sessionId: analysis.meta.sessionId } : {}),
        ...(analysis.meta?.threadId ? { threadId: analysis.meta.threadId } : {}),
        timestamp,
      };
      return analyzeCodexContextBlocks(part.text, {
        tokenizer: 'approx',
        ...(part.blockIds ? { blockIds: part.blockIds } : {}),
        evidenceLevel: part.evidenceLevel,
        provenance,
      });
    });
    const blocks = parsedParts.flatMap((parsed) => parsed.blocks).map((block) => contextBlockSnapshotFrom(block, filePath, line));
    if (blocks.length === 0) return;
    const text = parts.map((part) => part.text).join('\n');
    const hasDiagnostics = parsedParts.some((parsed) => parsed.diagnostics.length > 0);
    const evidenceLevel = parts.some((part) => part.evidenceLevel === 'text-observed')
      ? 'text-observed'
      : 'runtime-item-observed';
    for (const block of blocks) {
      analysis.currentContextBlocks.set(block.id, block);
      analysis.currentContextBlockLines.set(block.id, line);
    }
    analysis.contextSnapshots.push({
      timestamp,
      full: false,
      sourceKind: 'response_item',
      role,
      contextTextChars: text.length,
      ...(hashText(text) ? { contextTextSha256: hashText(text) } : {}),
      contextBlocksComplete: !hasDiagnostics && blocks.every((block) => block.complete),
      evidenceLevel,
      contextBlocks: blocks,
      sourcePath: filePath,
      line,
    });
    return;
  }

  if (stringValue(value.type) === 'turn_context') {
    const turnId = stringValue(payload.turn_id);
    const cwd = stringValue(payload.cwd);
    if (cwd) analysis.cwdCandidates.push(cwd);
    const workspaceRoots = Array.isArray(payload.workspace_roots)
      ? payload.workspace_roots.filter((item): item is string => typeof item === 'string')
      : [];
    analysis.workspaceRoots.push(...workspaceRoots);
    analysis.modelContexts.push({
      ...(stringValue(payload.model) ? { model: payload.model as string } : {}),
      ...(stringValue(payload.effort) ? { effort: payload.effort as string } : {}),
      ...(cwd ? { cwd } : {}),
      ...(stringValue(payload.approval_policy) ? { approvalPolicy: payload.approval_policy as string } : {}),
      ...(stringValue(payload.sandbox_policy) ? { sandboxPolicy: payload.sandbox_policy as string } : {}),
      ...(turnId ? { turnId } : {}),
      timestamp,
      sourcePath: filePath,
      line,
    });
  }
}

async function collectJsonl(filePath: string, archived: boolean, options: CollectJsonlOptions): Promise<CodexSessionFileAnalysis> {
  const base = options.baseAnalysis;
  const diagnostics: BenefitDiagnostic[] = [...(base?.diagnostics ?? [])];
  let bytes = 0;
  try {
    bytes = (await stat(filePath)).size;
  } catch (error) {
    return {
      usageRecords: [],
      modelContexts: [],
      contextSnapshots: [],
      cwdCandidates: [],
      workspaceRoots: [],
      observedEventTypes: [],
      events: emptyEvents(),
      status: 'invalid',
      diagnostics: [diagnostic('session.stat_failed', 'error', `Unable to stat session file: ${String(error)}`, filePath)],
      bytes: 0,
      lineCount: 0,
    };
  }
  if (bytes > options.maxFileBytes) {
    return {
      usageRecords: [],
      modelContexts: [],
      contextSnapshots: [],
      cwdCandidates: [],
      workspaceRoots: [],
      observedEventTypes: [],
      events: emptyEvents(),
      status: 'invalid',
      diagnostics: [diagnostic('session.file_too_large', 'error', `Session file exceeds ${options.maxFileBytes} bytes`, filePath)],
      bytes,
      lineCount: 0,
    };
  }

  const lastSnapshot = base?.contextSnapshots.at(-1);
  const currentContextBlocks = new Map<string, CodexContextBlockSnapshot>();
  const currentContextBlockLines = new Map<string, number>();
  for (const snapshot of base?.contextSnapshots ?? []) {
    if (snapshot.sourceKind === 'world_state' && snapshot.full) {
      currentContextBlocks.clear();
      currentContextBlockLines.clear();
    }
    for (const block of snapshot.contextBlocks ?? []) {
      currentContextBlocks.set(block.id, { ...block });
      currentContextBlockLines.set(block.id, block.line);
    }
  }
  const mutable: MutableAnalysis = {
    ...(base?.meta ? { meta: { ...base.meta } } : {}),
    usageRecords: base?.usageRecords.map((record) => ({ ...record, usage: { ...record.usage } })) ?? [],
    tokenCounts: [],
    modelContexts: base?.modelContexts.map((context) => ({ ...context })) ?? [],
    contextSnapshots: base?.contextSnapshots.map((snapshot) => ({ ...snapshot })) ?? [],
    cwdCandidates: base?.cwdCandidates ? [...base.cwdCandidates] : [],
    workspaceRoots: base?.workspaceRoots ? [...base.workspaceRoots] : [],
    observedEventTypes: new Set(base?.observedEventTypes ?? []),
    events: base ? { ...base.events, itemTypes: { ...base.events.itemTypes } } : emptyEvents(),
    ...(lastSnapshot?.agentsText ? { currentAgentsText: lastSnapshot.agentsText } : {}),
    ...(lastSnapshot?.agentsDirectory ? { currentAgentsDirectory: lastSnapshot.agentsDirectory } : {}),
    ...(lastSnapshot?.agentsTruncated !== undefined ? { currentAgentsTruncated: lastSnapshot.agentsTruncated } : {}),
    ...(lastSnapshot?.agentsComplete !== undefined ? { currentAgentsComplete: lastSnapshot.agentsComplete } : {}),
    ...(lastSnapshot?.hostSkillsText ? { currentHostSkillsText: lastSnapshot.hostSkillsText } : {}),
    ...(lastSnapshot?.hostSkillsTruncated !== undefined ? { currentHostSkillsTruncated: lastSnapshot.hostSkillsTruncated } : {}),
    ...(lastSnapshot?.hostSkillsComplete !== undefined ? { currentHostSkillsComplete: lastSnapshot.hostSkillsComplete } : {}),
    currentContextBlocks,
    currentContextBlockLines,
    contextSnapshotValid: base?.contextSnapshotValid ?? true,
    contextSnapshotAwaitingFull: base?.contextSnapshotAwaitingFull ?? false,
    firstTimestamp: base?.firstTimestamp,
    lastTimestamp: base?.lastTimestamp,
    status: base?.status ?? 'complete',
    diagnostics,
    bytes,
    lineCount: base?.lineCount ?? 0,
    archived,
  };
  const modelByTurn = new Map<string, CodexModelContext>();
  for (const context of mutable.modelContexts) {
    if (context.turnId) modelByTurn.set(context.turnId, context);
  }
  const stream = createReadStream(filePath, {
    encoding: 'utf8',
    ...(options.startOffset && options.startOffset > 0 ? { start: options.startOffset } : {}),
    ...(bytes > 0 ? { end: bytes - 1 } : {}),
  });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const rawLine of lines) {
      assertNotAborted(options.signal);
      mutable.lineCount += 1;
      if (Buffer.byteLength(rawLine, 'utf8') > options.maxLineBytes) {
        mutable.status = 'partial';
        diagnostics.push(diagnostic('session.line_too_large', 'warning', `Skipped line exceeding ${options.maxLineBytes} bytes`, filePath, mutable.lineCount));
        continue;
      }
      if (!rawLine.trim()) continue;
      let parsed: ParsedLine['value'];
      try {
        parsed = JSON.parse(rawLine) as ParsedLine['value'];
      } catch {
        mutable.status = 'partial';
        diagnostics.push(diagnostic('session.invalid_json', 'warning', 'Skipped invalid JSONL line', filePath, mutable.lineCount));
        continue;
      }

      const timestamp = parseTimestamp(parsed.timestamp);
      addTimestamp(mutable, timestamp);
      mutable.observedEventTypes.add(stringValue(parsed.type) ?? 'unknown');
      if (parsed.type === 'session_meta') {
        const meta = sessionMetaFrom(parsed, filePath, archived);
        if (meta) {
          mutable.meta = meta;
          mutable.cwdCandidates.push(...(meta.cwd ? [meta.cwd] : []));
          if (options.exactProjectDir) {
            let cwd: string | undefined;
            try { cwd = meta.cwd ? realpathSync(meta.cwd) : undefined; } catch { /* Missing projects do not match. */ }
            if (cwd !== options.exactProjectDir) break;
          }
        } else {
          mutable.status = 'partial';
          diagnostics.push(diagnostic('session.invalid_meta', 'warning', 'Session metadata is missing a valid ID or timestamp', filePath, mutable.lineCount));
        }
        continue;
      }

      const payload = objectValue(parsed.payload);
      if (parsed.type === 'response_item' && payload) {
        if (options.includeContext !== false) addContextRecord(mutable, parsed, filePath, mutable.lineCount, timestamp ?? mutable.firstTimestamp ?? new Date(0).toISOString());
        continue;
      }
      if (parsed.type === 'turn_context' && payload) {
        addContextRecord(mutable, parsed, filePath, mutable.lineCount, timestamp ?? mutable.firstTimestamp ?? new Date(0).toISOString());
        const context = mutable.modelContexts.at(-1);
        if (context?.turnId) modelByTurn.set(context.turnId, context);
        continue;
      }
      if (parsed.type === 'world_state') {
        if (options.includeContext !== false) addContextRecord(mutable, parsed, filePath, mutable.lineCount, timestamp ?? mutable.firstTimestamp ?? new Date(0).toISOString());
        continue;
      }
      if (parsed.type === 'token_usage_record') {
        const contextSnapshotLines = currentContextSnapshotLines(mutable);
        const record = usageRecordFrom(parsed, filePath, mutable.lineCount, archived, modelByTurn, latestContextSnapshot(mutable, contextSnapshotLines), contextSnapshotLines);
        if (record) mutable.usageRecords.push(record);
        else {
          mutable.status = 'partial';
          diagnostics.push(diagnostic('usage.invalid_record', 'warning', 'Skipped token usage record with incomplete identity or usage fields', filePath, mutable.lineCount));
        }
        continue;
      }
      if (parsed.type === 'event_msg' && payload) {
        const eventType = stringValue(payload.type);
        if (eventType === 'token_count') {
          const info = objectValue(payload.info);
          mutable.tokenCounts.push({
            line: mutable.lineCount,
            timestamp: timestamp ?? mutable.firstTimestamp ?? new Date(0).toISOString(),
            threadId: stringValue(payload.thread_id),
            turnId: stringValue(payload.turn_id),
            totalUsage: objectValue(info?.total_token_usage),
            lastUsage: objectValue(info?.last_token_usage),
            ...(() => {
              const contextSnapshotLines = currentContextSnapshotLines(mutable);
              const latest = latestContextSnapshot(mutable, contextSnapshotLines);
              return {
                ...(latest ? { contextSnapshotLine: latest.line, contextSnapshotTimestamp: latest.timestamp } : {}),
                ...(contextSnapshotLines.length > 0 ? { contextSnapshotLines } : {}),
              };
            })(),
          });
        } else {
          addTurnEvent(mutable, payload);
        }
      }
      if (parsed.type === 'compacted' || (parsed.type === 'event_msg' && payload?.type === 'item_completed' && objectValue(payload.item)?.type === 'ContextCompaction')) {
        mutable.events.compactions += 1;
        mutable.contextSnapshotValid = false;
        mutable.contextSnapshotAwaitingFull = true;
        mutable.currentContextBlocks.clear();
        mutable.currentContextBlockLines.clear();
        diagnostics.push(diagnostic('context.snapshot_invalidated_by_compaction', 'warning', 'Historical context evidence was invalidated by compaction until a new full world_state snapshot appears', filePath, mutable.lineCount));
        if (hasEmbeddedUsage(payload)) {
          diagnostics.push(diagnostic('usage.compacted_embedded_ignored', 'warning', 'Compaction record contained embedded usage-like fields; only token_usage_record or the constrained token_count fallback is counted', filePath, mutable.lineCount));
        }
      }
    }
  } catch (error) {
    if (options.signal?.aborted) throw error;
    mutable.status = 'partial';
    diagnostics.push(diagnostic('session.read_failed', 'error', `Session stream ended with an error: ${String(error)}`, filePath));
  } finally {
    lines.close();
    stream.destroy();
  }

  if (mutable.usageRecords.length === 0 && mutable.tokenCounts.length > 0) {
    const hasPerResponseUsage = mutable.tokenCounts.some((pending) => pending.lastUsage);
    const fallbackSource = hasPerResponseUsage
      ? mutable.tokenCounts.filter((pending) => pending.lastUsage)
      : mutable.tokenCounts.slice(-1);
    const fallbackRecords = fallbackSource
      .map((pending, index) => tokenCountRecordFrom(pending, filePath, archived, index, mutable.meta, modelByTurn))
      .filter((record): record is CodexUsageRecord => Boolean(record));
    if (fallbackRecords.length > 0) {
      mutable.usageRecords.push(...fallbackRecords);
      mutable.status = mutable.status === 'complete' ? 'partial' : mutable.status;
      diagnostics.push(diagnostic('usage.token_count_fallback', 'warning', 'Used event_msg token_count because token_usage_record was unavailable', filePath));
      if (!hasPerResponseUsage && mutable.tokenCounts.length > 1) {
        diagnostics.push(diagnostic('usage.token_count_cumulative', 'warning', 'Multiple token_count records had no last_token_usage; only the latest cumulative total was retained to avoid double counting', filePath));
      }
    }
  }

  const uniqueRecords = new Map<string, CodexUsageRecord>();
  for (const record of mutable.usageRecords) {
    const existing = uniqueRecords.get(record.responseId);
    if (existing) {
      mutable.status = 'partial';
      diagnostics.push(diagnostic('usage.duplicate_response', 'warning', `Ignored duplicate response ${record.responseId}`, filePath, record.line));
      continue;
    }
    uniqueRecords.set(record.responseId, record);
  }

  const meta = mutable.meta;
  for (const record of uniqueRecords.values()) {
    const context = record.turnId ? modelByTurn.get(record.turnId) : undefined;
    if (context) {
      record.model = context.model;
      record.effort = context.effort;
      if (!record.cwd && context.cwd) record.cwd = context.cwd;
    }
    if (!record.cwd && meta?.cwd) record.cwd = meta.cwd;
    if (record.quality === 'partial') {
      diagnostics.push(diagnostic('usage.partial_record', 'warning', `Usage record ${record.responseId} is missing one or more usage fields; it is shown but excluded from totals`, filePath, record.line));
    }
  }

  return {
    ...(meta ? { meta } : {}),
    usageRecords: [...uniqueRecords.values()],
    modelContexts: mutable.modelContexts,
    contextSnapshots: mutable.contextSnapshots,
    cwdCandidates: [...new Set(mutable.cwdCandidates)],
    workspaceRoots: [...new Set(mutable.workspaceRoots)],
    observedEventTypes: [...mutable.observedEventTypes].sort(),
    events: mutable.events,
    ...(mutable.firstTimestamp ? { firstTimestamp: mutable.firstTimestamp } : {}),
    ...(mutable.lastTimestamp ? { lastTimestamp: mutable.lastTimestamp } : {}),
    status: meta ? mutable.status : 'invalid',
    diagnostics,
    bytes,
    lineCount: mutable.lineCount,
    contextSnapshotValid: mutable.contextSnapshotValid,
    contextSnapshotAwaitingFull: mutable.contextSnapshotAwaitingFull,
  };
}

async function listJsonlFiles(root: string, maxFiles: number, maxDepth: number, signal?: AbortSignal): Promise<{ files: string[]; truncated: boolean }> {
  const result: string[] = [];
  let truncated = false;
  async function visit(directory: string, depth: number): Promise<void> {
    assertNotAborted(signal);
    if (depth > maxDepth || result.length >= maxFiles) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        result.push(path);
        if (result.length >= maxFiles) {
          truncated = true;
          return;
        }
      }
    }
  }
  await visit(root, 0);
  return { files: result.sort(), truncated };
}

function pathWithin(projectDir: string, candidate: string): boolean {
  const canonical = (value: string): string => {
    const absolute = resolve(value);
    let current = absolute;
    const suffix: string[] = [];
    try {
      return realpathSync.native(absolute);
    } catch {
      while (current !== dirname(current)) {
        suffix.unshift(basename(current));
        current = dirname(current);
        try {
          return resolve(realpathSync.native(current), ...suffix);
        } catch {
          // Continue toward the nearest existing parent so /tmp symlinks are resolved too.
        }
      }
      return absolute;
    }
  };
  const root = canonical(projectDir);
  const normalized = canonical(candidate);
  const rel = relative(root, normalized);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function isDefaultExcludedWorktree(projectDir: string, candidate: string): boolean {
  const rel = relative(resolve(projectDir), resolve(candidate));
  const parts = rel.split(sep).filter(Boolean);
  return parts.includes('.worktrees') || parts.some((part, index) => part === '.git' && parts[index + 1] === 'worktrees');
}

function pathWithinProjectScope(projectDir: string, candidate: string): boolean {
  return pathWithin(projectDir, candidate) && !isDefaultExcludedWorktree(projectDir, candidate);
}

function belongsToProject(analysis: CodexSessionFileAnalysis, projectDir: string): boolean {
  const paths = [...analysis.cwdCandidates, ...analysis.workspaceRoots];
  return paths.some((candidate) => pathWithinProjectScope(projectDir, candidate));
}

function timestampMs(timestamp: string | undefined): number | undefined {
  if (!timestamp) return undefined;
  const result = Date.parse(timestamp);
  return Number.isFinite(result) ? result : undefined;
}

function inWindow(timestamp: string | undefined, sinceMs: number, untilMs: number): boolean {
  const value = timestampMs(timestamp);
  return value !== undefined && value >= sinceMs && value <= untilMs;
}

function sumUsage(records: CodexUsageRecord[]): CodexSessionUsageSummary {
  return records.reduce<CodexSessionUsageSummary>((summary, record) => {
    if (record.quality !== 'complete') return summary;
    summary.inputTokens += record.usage.inputTokens;
    summary.cachedInputTokens += record.usage.cachedInputTokens;
    summary.cacheWriteInputTokens += record.usage.cacheWriteInputTokens;
    summary.outputTokens += record.usage.outputTokens;
    summary.reasoningOutputTokens += record.usage.reasoningOutputTokens;
    summary.totalTokens += record.usage.totalTokens;
    summary.completeResponseCount += 1;
    return summary;
  }, {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    responseCount: records.length,
    completeResponseCount: 0,
  });
}

function mergeEvents(analyses: CodexSessionFileAnalysis[]): CodexEventSummary {
  return analyses.reduce<CodexEventSummary>((result, analysis) => {
    for (const [type, count] of Object.entries(analysis.events.itemTypes)) {
      result.itemTypes[type] = (result.itemTypes[type] ?? 0) + count;
    }
    result.toolCalls += analysis.events.toolCalls;
    result.commandExecutions += analysis.events.commandExecutions;
    result.fileChanges += analysis.events.fileChanges;
    result.mcpCalls += analysis.events.mcpCalls;
    result.compactions += analysis.events.compactions;
    result.completedTurns += analysis.events.completedTurns;
    result.failedTurns += analysis.events.failedTurns;
    result.cancelledTurns += analysis.events.cancelledTurns;
    if (analysis.events.durationMs !== undefined) result.durationMs = (result.durationMs ?? 0) + analysis.events.durationMs;
    if (analysis.events.timeToFirstTokenMs !== undefined) result.timeToFirstTokenMs = (result.timeToFirstTokenMs ?? 0) + analysis.events.timeToFirstTokenMs;
    return result;
  }, emptyEvents());
}

function mergeDiagnostics(analyses: CodexSessionFileAnalysis[]): BenefitDiagnostic[] {
  return analyses.flatMap((analysis) => analysis.diagnostics);
}

function selectStatus(analyses: CodexSessionFileAnalysis[], usage: CodexUsageRecord[]): BenefitRecordStatus {
  if (analyses.length === 0) return 'empty';
  if (usage.length === 0) return analyses.some((analysis) => analysis.status === 'invalid') ? 'invalid' : 'empty';
  if (analyses.some((analysis) => analysis.status === 'invalid' || analysis.status === 'partial' || analysis.diagnostics.length > 0)) return 'partial';
  return 'complete';
}

function getDefaultHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

function getCodexHome(options: CodexSessionScanOptions): string {
  return resolve(options.codexHome ?? process.env.CODEX_HOME ?? join(options.homeDir ?? getDefaultHomeDir(), '.codex'));
}

function recordProjectStatus(
  analysis: CodexSessionFileAnalysis,
  record: CodexUsageRecord,
  projectDir: string,
): boolean | undefined {
  if (record.cwd) return pathWithinProjectScope(projectDir, record.cwd);
  if (analysis.cwdCandidates.length === 0) return undefined;
  const inside = analysis.cwdCandidates.filter((candidate) => pathWithinProjectScope(projectDir, candidate));
  if (inside.length === 0) return false;
  return inside.length === analysis.cwdCandidates.length ? true : undefined;
}

function usageInWindow(
  analysis: CodexSessionFileAnalysis,
  sinceMs: number,
  untilMs: number,
  projectDir: string,
): CodexUsageRecord[] {
  return analysis.usageRecords.filter((record) => {
    if (!inWindow(record.timestamp, sinceMs, untilMs)) return false;
    const projectStatus = recordProjectStatus(analysis, record, projectDir);
    if (projectStatus === undefined) {
      const code = 'session.cwd_ambiguous';
      if (!analysis.diagnostics.some((item) => item.code === code && item.line === record.line)) {
        analysis.diagnostics.push(diagnostic(code, 'warning', `Skipped response ${record.responseId}: the session contains multiple project directories and this response has no unambiguous cwd`, record.sourcePath, record.line));
      }
    }
    return projectStatus === true;
  });
}

function mainSession(analysis: CodexSessionFileAnalysis): boolean {
  return Boolean(analysis.meta && !analysis.meta.parentThreadId);
}

function isCandidateInWindow(analysis: CodexSessionFileAnalysis, sinceMs: number, untilMs: number): boolean {
  const last = timestampMs(analysis.lastTimestamp ?? analysis.meta?.timestamp);
  const first = timestampMs(analysis.firstTimestamp ?? analysis.meta?.timestamp);
  return last !== undefined && first !== undefined && last >= sinceMs && first <= untilMs;
}

function associatedAnalyses(
  root: CodexSessionFileAnalysis,
  byThreadId: Map<string, CodexSessionFileAnalysis>,
): CodexSessionFileAnalysis[] {
  const result: CodexSessionFileAnalysis[] = [root];
  const visited = new Set([root.meta?.threadId]);
  const queue = [root.meta?.threadId].filter((id): id is string => Boolean(id));
  while (queue.length > 0) {
    const parent = queue.shift();
    if (!parent) continue;
    for (const candidate of byThreadId.values()) {
      const candidateParent = candidate.meta?.parentThreadId;
      if (candidateParent !== parent || !candidate.meta || visited.has(candidate.meta.threadId)) continue;
      visited.add(candidate.meta.threadId);
      result.push(candidate);
      queue.push(candidate.meta.threadId);
    }
  }
  return result;
}

export async function analyzeCodexSessionFile(
  filePath: string,
  options: Pick<CodexSessionScanOptions, 'maxFileBytes' | 'maxLineBytes' | 'includeContext'> & {
    archived?: boolean;
    startOffset?: number;
    baseAnalysis?: CodexSessionFileAnalysis;
    signal?: AbortSignal;
    exactProjectDir?: string;
  } = {},
): Promise<CodexSessionFileAnalysis> {
  return collectJsonl(filePath, options.archived === true, {
    includeContext: options.includeContext,
    exactProjectDir: options.exactProjectDir,
    maxFileBytes: options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
    maxLineBytes: options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES,
    ...(options.startOffset !== undefined ? { startOffset: options.startOffset } : {}),
    ...(options.baseAnalysis ? { baseAnalysis: options.baseAnalysis } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

/** Convert trusted response-item observations into the CLI block-report shape. */
export function contextBlockAnalysisFromSession(
  analysis: CodexSessionFileAnalysis,
  sourcePath = analysis.meta?.filePath,
  options: { tokenizer?: 'openai' | 'approx'; tokenizerModel?: string } = {},
): CodexContextBlockAnalysis {
  const tokenCounter = createTokenCounter({ tokenizer: options.tokenizer, tokenizerModel: options.tokenizerModel });
  const latest = new Map<string, CodexContextBlockSnapshot>();
  for (const snapshot of analysis.contextSnapshots) {
    if (snapshot.sourceKind !== 'response_item') continue;
    for (const block of snapshot.contextBlocks ?? []) latest.set(block.id, block);
  }
  const blocks: CodexContextBlockObservation[] = [...latest.values()].map((block) => ({
    id: block.id,
    tag: block.tag,
    role: block.role,
    ...(block.contentKind ? { contentKind: block.contentKind } : {}),
    activation: block.activation,
    text: block.text ?? '',
    estimatedTokens: tokenCounter.count(block.text ?? ''),
    estimatedChars: block.estimatedChars,
    complete: block.complete,
    startOffset: 0,
    endOffset: block.estimatedChars,
    ...(block.rootAliases ? { rootAliases: block.rootAliases } : {}),
    ...(block.availableSkills ? { availableSkills: block.availableSkills } : {}),
    ...(block.recommendedPlugins ? { recommendedPlugins: block.recommendedPlugins } : {}),
    ...(block.controlMethod ? { controlMethod: block.controlMethod } : {}),
    ...(block.controllable !== undefined ? { controllable: block.controllable } : {}),
    ...(block.controlStatus ? { controlStatus: block.controlStatus } : {}),
    ...(block.evidenceLevel ? { evidenceLevel: block.evidenceLevel } : {}),
    observationStatus: 'present',
    ...(block.provenance ? { provenance: block.provenance } : {}),
    recommendation: block.recommendation,
  }));
  const snapshotEvidence = analysis.contextSnapshots
    .map((snapshot) => snapshot.evidenceLevel)
    .find((level): level is CodexContextEvidenceLevel => Boolean(level));
  const trustedSnapshot = analysis.contextSnapshots.find((snapshot) => snapshot.evidenceLevel === 'runtime-item-observed');
  const verification: CodexContextBlockVerification[] = CODEX_CONTEXT_BLOCK_IDS.map((id) => {
    const observed = blocks.find((block) => block.id === id);
    if (observed && observed.evidenceLevel !== 'text-observed') {
      return {
        id,
        status: 'present',
        evidenceLevel: observed.evidenceLevel,
        sourcePath: observed.provenance?.sourcePath ?? sourcePath,
        line: observed.provenance?.line,
        sessionId: observed.provenance?.sessionId,
        threadId: observed.provenance?.threadId,
        reason: 'A trusted response-item metadata entry contains this context block.',
      };
    }
    if (analysis.contextSnapshotValid === false || analysis.contextSnapshotAwaitingFull) {
      return { id, status: 'unknown', reason: 'The session context snapshot is invalid or awaiting a new full snapshot.' };
    }
    if (trustedSnapshot) {
      return {
        id,
        status: 'absent',
        evidenceLevel: 'runtime-item-observed',
        sourcePath: trustedSnapshot.sourcePath,
        line: trustedSnapshot.line,
        sessionId: analysis.meta?.sessionId,
        threadId: analysis.meta?.threadId,
        reason: 'Trusted response-item metadata was present, but no matching block was observed in this session header.',
      };
    }
    if (observed) {
      return { id, status: 'unknown', evidenceLevel: 'text-observed', sourcePath, reason: 'A text-only block match was found, but no trusted content_item_kinds metadata proves it is a session-header item.' };
    }
    return { id, status: 'unknown', reason: 'No trusted content_item_kinds metadata was available; text-only absence is not proof.' };
  });
  return {
    ...(sourcePath ? { sourcePath } : {}),
    textChars: analysis.contextSnapshots.reduce((sum, snapshot) => sum + (snapshot.contextTextChars ?? 0), 0),
    totalEstimatedTokens: blocks.reduce((sum, block) => sum + block.estimatedTokens, 0),
    tokenizer: tokenCounter.summary,
    blocks,
    diagnostics: analysis.diagnostics.map((item) => item.message),
    ...(snapshotEvidence ? { evidenceLevel: snapshotEvidence } : {}),
    verification,
  };
}

async function hasTrailingNewline(filePath: string, size: number): Promise<boolean> {
  if (size === 0) return true;
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(1);
    const result = await handle.read(buffer, 0, 1, size - 1);
    return result.bytesRead === 1 && buffer[0] === 0x0a;
  } finally {
    await handle.close();
  }
}

async function hashFilePrefix(filePath: string, length: number): Promise<string | undefined> {
  const hash = createHash('sha256');
  if (length === 0) return hash.digest('hex');
  return new Promise((resolveHash) => {
    const stream = createReadStream(filePath, { start: 0, end: length - 1 });
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', () => resolveHash(undefined));
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

export async function scanCodexSessions(options: CodexSessionScanOptions): Promise<CodexSessionScanResult> {
  assertNotAborted(options.signal);
  const scanStartedAt = Date.now();
  let discoveryMs = 0;
  let parseMs = 0;
  let peakRssBytes: number | undefined;
  let peakHeapUsedBytes: number | undefined;
  const recordMemory = (): void => {
    const usage = process.memoryUsage();
    peakRssBytes = Math.max(peakRssBytes ?? 0, usage.rss);
    peakHeapUsedBytes = Math.max(peakHeapUsedBytes ?? 0, usage.heapUsed);
  };
  recordMemory();
  const projectDir = resolve(options.projectDir);
  const codexHome = getCodexHome(options);
  const sinceMs = options.sinceMs;
  const untilMs = options.untilMs ?? Date.now();
  const requestedLimit = options.limit ?? DEFAULT_LIMIT;
  const sessionRoots = [join(codexHome, 'sessions'), ...(options.includeArchived ? [join(codexHome, 'archived_sessions')] : [])];
  const diagnostics: BenefitDiagnostic[] = [];
  const skipped: CodexSessionScanResult['skipped'] = [];
  const analyses: CodexSessionFileAnalysis[] = [];
  const skippedByReason: Record<string, number> = {};
  const indexEnabled = options.useIndex === true && options.includeContext !== false && !options.exactProjectOnly;
  const indexPath = indexEnabled ? (options.indexPath ?? defaultSessionIndexPath(options.homeDir)) : undefined;
  const sessionIndex = indexPath ? await loadSessionIndex(indexPath) : undefined;
  const indexedByPath = new Map((sessionIndex?.entries ?? []).map((entry) => [entry.filePath, entry]));
  const indexEntries = new Map<string, SessionIndexEntry>();
  const readBoundaries = new Map<string, NonNullable<CodexSessionScanResult['readBoundaries']>[number]>();
  let indexCacheHits = 0;
  let indexIncrementalFiles = 0;
  let indexRebuiltFiles = 0;
  let discoveredFiles = 0;
  const addSkipped = (entry: CodexSessionScanResult['skipped'][number]): void => {
    skipped.push(entry);
    skippedByReason[entry.reason] = (skippedByReason[entry.reason] ?? 0) + 1;
  };

  for (const root of sessionRoots) {
    assertNotAborted(options.signal);
    const discoveryStartedAt = Date.now();
    try {
      const rootStat = await stat(root);
      if (!rootStat.isDirectory()) {
        diagnostics.push(diagnostic('session.root_not_directory', 'warning', `Codex session root is not a directory: ${root}`, root));
        continue;
      }
    } catch (error) {
      diagnostics.push(diagnostic('session.root_unavailable', 'warning', `Codex session root is missing or unreadable: ${root}. ${String(error)}`, root));
      continue;
    }
    const listing = await listJsonlFiles(root, options.maxFiles ?? DEFAULT_MAX_FILES, options.maxDepth ?? DEFAULT_MAX_DEPTH, options.signal);
    discoveryMs += Date.now() - discoveryStartedAt;
    const files = listing.files;
    if (listing.truncated) {
      diagnostics.push(diagnostic('session.discovery_limit', 'warning', `Session discovery stopped at ${options.maxFiles ?? DEFAULT_MAX_FILES} files or depth ${options.maxDepth ?? DEFAULT_MAX_DEPTH}; the report is partial`, root));
    }
    discoveredFiles += files.length;
    for (const filePath of files) {
      assertNotAborted(options.signal);
      const parseStartedAt = Date.now();
      const archived = root.endsWith('archived_sessions');
      const fileStat = await stat(filePath).catch(() => undefined);
      const indexed = indexedByPath.get(filePath);
      let analysis: CodexSessionFileAnalysis;
      if (fileStat && indexed && indexEntryMatches(indexed, fileStat.size, fileStat.mtimeMs, archived)) {
        const cachedAnalysis = {
          ...indexed.analysis,
          observedEventTypes: indexed.analysis.observedEventTypes ?? [],
          diagnostics: [...indexed.analysis.diagnostics],
        };
        const needsContextText = cachedAnalysis.contextSnapshots.some((snapshot) =>
          (snapshot.agentsTextChars !== undefined && !snapshot.agentsText)
          || (snapshot.hostSkillsTextChars !== undefined && !snapshot.hostSkillsText)
          || (snapshot.contextTextChars !== undefined && snapshot.contextBlocks?.some((block) => !block.text)),
        );
        if (needsContextText) {
          analysis = await analyzeCodexSessionFile(filePath, {
            archived,
            includeContext: options.includeContext,
            exactProjectDir: options.exactProjectOnly ? realpathSync(projectDir) : undefined,
            maxFileBytes: options.maxFileBytes,
            maxLineBytes: options.maxLineBytes,
            ...(options.signal ? { signal: options.signal } : {}),
          });
          diagnostics.push(diagnostic('index.context_text_reloaded', 'info', 'Reloaded local world_state lines because the metadata index intentionally omits context text', filePath));
        } else {
          analysis = cachedAnalysis;
          indexCacheHits += 1;
        }
      } else {
        const canTryIncremental = Boolean(
          fileStat
          && indexed
          && fileStat.size > indexed.size
          && indexed.readOffset === indexed.size
          && indexed.prefixHash
          // The persisted index omits text. Rehydrate before extending its context state.
          && !indexed.analysis.contextSnapshots.some((snapshot) =>
            (snapshot.agentsTextChars !== undefined && !snapshot.agentsText)
            || (snapshot.hostSkillsTextChars !== undefined && !snapshot.hostSkillsText)
            || (snapshot.contextTextChars !== undefined && snapshot.contextBlocks?.some((block) => !block.text)))
          && !indexed.analysis.usageRecords.some((record) => record.sourceKind === 'token_count'),
        );
        const prefixHash = canTryIncremental && indexed
          ? await hashFilePrefix(filePath, indexed.size)
          : undefined;
        const appendIsSafe = canTryIncremental && indexed && prefixHash === indexed.prefixHash
          ? await hasTrailingNewline(filePath, fileStat!.size)
          : false;
        if (appendIsSafe && indexed) {
          analysis = await analyzeCodexSessionFile(filePath, {
            archived,
            includeContext: options.includeContext,
            exactProjectDir: options.exactProjectOnly ? realpathSync(projectDir) : undefined,
            maxFileBytes: options.maxFileBytes,
            maxLineBytes: options.maxLineBytes,
            startOffset: indexed.readOffset,
            baseAnalysis: indexed.analysis,
            ...(options.signal ? { signal: options.signal } : {}),
          });
          indexIncrementalFiles += 1;
        } else {
          if (indexed) indexRebuiltFiles += 1;
          analysis = await analyzeCodexSessionFile(filePath, {
            archived,
            includeContext: options.includeContext,
            exactProjectDir: options.exactProjectOnly ? realpathSync(projectDir) : undefined,
            maxFileBytes: options.maxFileBytes,
            maxLineBytes: options.maxLineBytes,
            ...(options.signal ? { signal: options.signal } : {}),
          });
        }
      }
      parseMs += Date.now() - parseStartedAt;
      recordMemory();
      if (fileStat) {
        assertNotAborted(options.signal);
        const completeReadOffset = await hasTrailingNewline(filePath, fileStat.size) ? fileStat.size : 0;
        readBoundaries.set(filePath, { filePath, archived, size: fileStat.size, mtimeMs: fileStat.mtimeMs, readOffset: completeReadOffset });
        if (indexEnabled) {
          const fileHash = await hashFilePrefix(filePath, fileStat.size);
          if (!fileHash) {
            diagnostics.push(diagnostic('index.hash_failed', 'warning', `Unable to fingerprint session file for incremental indexing: ${filePath}`, filePath));
          }
          indexEntries.set(filePath, {
            filePath,
            archived,
            size: fileStat.size,
            mtimeMs: fileStat.mtimeMs,
            readOffset: completeReadOffset,
            prefixHash: fileHash ?? '',
            analysis: sanitizeAnalysisForIndex(analysis),
          });
        }
      }
      if (!analysis.meta) {
        addSkipped({ filePath, reason: 'missing-valid-session-meta', diagnostics: analysis.diagnostics });
        continue;
      }
      if (!belongsToProject(analysis, projectDir)) {
        addSkipped({ filePath, reason: 'outside-project', diagnostics: analysis.diagnostics });
        continue;
      }
      if (!isCandidateInWindow(analysis, sinceMs, untilMs)) {
        addSkipped({ filePath, reason: 'outside-time-window', diagnostics: analysis.diagnostics });
        continue;
      }
      analyses.push(analysis);
    }
  }

  const byThreadId = new Map(analyses.flatMap((analysis) => analysis.meta ? [[analysis.meta.threadId, analysis] as const] : []));
  const mainAnalyses = analyses
    .filter((analysis) => mainSession(analysis))
    .sort((left, right) => (timestampMs(right.lastTimestamp) ?? 0) - (timestampMs(left.lastTimestamp) ?? 0));
  const selectedRoots = mainAnalyses.slice(0, Math.max(0, requestedLimit));
  const selected: CodexSessionSelection[] = [];
  const selectionStartedAt = Date.now();

  for (const root of selectedRoots) {
    assertNotAborted(options.signal);
    const associated = associatedAnalyses(root, byThreadId);
    const usage = associated.flatMap((analysis) => usageInWindow(analysis, sinceMs, untilMs, projectDir));
    const uniqueUsage = [...new Map(usage.map((record) => [`${record.threadId}:${record.responseId}`, record])).values()]
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.responseId.localeCompare(right.responseId));
    const rootMeta = root.meta!;
    const status = selectStatus(associated, uniqueUsage);
    selected.push({
      session: rootMeta,
      analysis: root,
      usage: uniqueUsage,
      associatedFiles: associated,
      summary: sumUsage(uniqueUsage),
      events: mergeEvents(associated),
      ...(uniqueUsage[0]?.timestamp ? { firstTimestamp: uniqueUsage[0].timestamp } : root.firstTimestamp ? { firstTimestamp: root.firstTimestamp } : {}),
      ...(uniqueUsage.at(-1)?.timestamp ? { lastTimestamp: uniqueUsage.at(-1)!.timestamp } : root.lastTimestamp ? { lastTimestamp: root.lastTimestamp } : {}),
      status,
      diagnostics: mergeDiagnostics(associated),
    });
  }

  const associatedFiles = new Set(selected.flatMap((selection) => selection.associatedFiles.map((analysis) => analysis.meta?.filePath)));
  for (const analysis of analyses) {
    if (!analysis.meta || associatedFiles.has(analysis.meta.filePath)) continue;
    addSkipped({ filePath: analysis.meta.filePath, reason: analysis.meta.parentThreadId ? 'unselected-parent-thread' : 'limit-exceeded', diagnostics: analysis.diagnostics });
  }
  diagnostics.push(...analyses.flatMap((analysis) => analysis.diagnostics));
  if (selected.length === 0) {
    diagnostics.push(diagnostic('session.no_match', 'info', `No Codex sessions matched ${projectDir} in the requested time window`));
  }
  if (indexPath) {
    assertNotAborted(options.signal);
    try {
      await saveSessionIndex(indexPath, pruneSessionIndexEntries([...indexEntries.values()], options.indexRetentionDays));
    } catch (error) {
      diagnostics.push(diagnostic('index.write_failed', 'warning', `Unable to update local session index: ${String(error)}`, indexPath));
    }
  }

  recordMemory();
  const selectionMs = Date.now() - selectionStartedAt;
  const totalMs = Date.now() - scanStartedAt;

  return {
    codexHome,
    sessionRoots,
    projectDir,
    sinceMs,
    untilMs,
    requestedLimit,
    candidates: analyses,
    selected,
    skipped,
    adapter: {
      id: 'codex-rollout-jsonl',
      version: '1',
      observedEventTypes: [...new Set(analyses.flatMap((analysis) => analysis.observedEventTypes))].sort(),
    },
    counts: {
      discoveredFiles,
      projectCandidates: analyses.length,
      selectedFiles: new Set(selected.flatMap((selection) => selection.associatedFiles.map((analysis) => analysis.meta?.filePath))).size,
      skippedFiles: skipped.length,
      skippedByReason,
    },
    index: {
      enabled: indexEnabled,
      ...(indexPath ? { path: indexPath } : {}),
      cacheHits: indexCacheHits,
      incrementalFiles: indexIncrementalFiles,
      rebuiltFiles: indexRebuiltFiles,
    },
    readBoundaries: [...readBoundaries.values()],
    timings: {
      totalMs,
      discoveryMs,
      parseMs,
      selectionMs,
      ...(peakRssBytes !== undefined ? { peakRssBytes } : {}),
      ...(peakHeapUsedBytes !== undefined ? { peakHeapUsedBytes } : {}),
    },
    diagnostics,
    generatedAt: new Date().toISOString(),
  };
}

export function summarizeUsage(records: CodexUsageRecord[]): CodexSessionUsageSummary {
  return sumUsage(records);
}

export function isPathWithinProject(projectDir: string, candidate: string): boolean {
  return pathWithin(projectDir, candidate);
}

export function formatSessionFileLabel(filePath: string): string {
  return `${basename(dirname(filePath))}/${basename(filePath)}`;
}
