import type {
  CodexAvailableSkillEntry,
  CodexContextBlockActivation,
  CodexContextBlockId,
  CodexContextBlockRole,
  CodexRecommendedPluginEntry,
  CodexSkillRootAlias,
  ContextTokenizerSummary,
} from '../types/context';
import type { OfflineHistoryAnalysis, OfflineHistoryInput } from './historyTypes';

export type BenefitRecordStatus = 'complete' | 'partial' | 'empty' | 'invalid';

export type BenefitDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface BenefitDiagnostic {
  code: string;
  severity: BenefitDiagnosticSeverity;
  message: string;
  sourcePath?: string;
  line?: number;
}

export interface CodexSessionMetaRecord {
  filePath: string;
  sessionId: string;
  threadId: string;
  parentThreadId?: string;
  timestamp: string;
  cwd?: string;
  originator?: string;
  cliVersion?: string;
  source?: string;
  threadSource?: string;
  modelProvider?: string;
  contextWindow?: number;
  archived: boolean;
}

export interface CodexUsage {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

export interface CodexModelContext {
  model?: string;
  effort?: string;
  cwd?: string;
  approvalPolicy?: string;
  sandboxPolicy?: string;
  turnId?: string;
  timestamp: string;
  sourcePath: string;
  line: number;
}

export interface CodexContextStateSnapshot {
  timestamp: string;
  full: boolean;
  sourceKind?: 'world_state' | 'response_item';
  role?: CodexContextBlockRole;
  stateKeys?: string[];
  agentsText?: string;
  agentsDirectory?: string;
  agentsTextChars?: number;
  agentsTruncated?: boolean;
  agentsComplete?: boolean;
  hostSkillsText?: string;
  hostSkillsTextChars?: number;
  hostSkillsTruncated?: boolean;
  hostSkillsComplete?: boolean;
  contextTextChars?: number;
  contextTextSha256?: string;
  contextBlocksComplete?: boolean;
  contextBlocks?: CodexContextBlockSnapshot[];
  sourcePath: string;
  line: number;
}

export interface CodexContextBlockSnapshot {
  id: CodexContextBlockId;
  tag: string;
  role: CodexContextBlockRole;
  activation: CodexContextBlockActivation;
  contentKind?: string;
  complete: boolean;
  estimatedChars: number;
  estimatedTokens?: number;
  text?: string;
  textSha256?: string;
  rootAliases?: CodexSkillRootAlias[];
  availableSkills?: CodexAvailableSkillEntry[];
  recommendedPlugins?: CodexRecommendedPluginEntry[];
  controlMethod?: string;
  controllable?: boolean;
  recommendation: string;
  sourcePath: string;
  line: number;
}

export interface CodexUsageRecord {
  responseId: string;
  sessionId: string;
  threadId: string;
  rootTurnId?: string;
  turnId?: string;
  timestamp: string;
  usage: CodexUsage;
  turnUsage?: CodexUsage;
  threadUsage?: CodexUsage;
  cwd?: string;
  usageValidation?: {
    turn: 'equal' | 'different' | 'unavailable' | 'not_comparable';
    thread: 'equal' | 'different' | 'unavailable' | 'not_comparable';
    reason?: string;
  };
  model?: string;
  effort?: string;
  sourcePath: string;
  line: number;
  contextSnapshotLine?: number;
  contextSnapshotLines?: number[];
  contextSnapshotTimestamp?: string;
  archived: boolean;
  sourceKind: 'token_usage_record' | 'token_count';
  quality: 'complete' | 'partial';
}

export interface CodexEventSummary {
  itemTypes: Record<string, number>;
  toolCalls: number;
  commandExecutions: number;
  fileChanges: number;
  mcpCalls: number;
  compactions: number;
  completedTurns: number;
  failedTurns: number;
  cancelledTurns: number;
  durationMs?: number;
  timeToFirstTokenMs?: number;
}

export interface CodexSessionFileAnalysis {
  meta?: CodexSessionMetaRecord;
  usageRecords: CodexUsageRecord[];
  modelContexts: CodexModelContext[];
  contextSnapshots: CodexContextStateSnapshot[];
  cwdCandidates: string[];
  workspaceRoots: string[];
  observedEventTypes: string[];
  events: CodexEventSummary;
  firstTimestamp?: string;
  lastTimestamp?: string;
  status: BenefitRecordStatus;
  diagnostics: BenefitDiagnostic[];
  bytes: number;
  lineCount: number;
  contextSnapshotValid?: boolean;
  contextSnapshotAwaitingFull?: boolean;
}

export interface CodexSessionUsageSummary {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
  responseCount: number;
  completeResponseCount: number;
}

export interface CodexSessionSelection {
  session: CodexSessionMetaRecord;
  analysis: CodexSessionFileAnalysis;
  usage: CodexUsageRecord[];
  associatedFiles: CodexSessionFileAnalysis[];
  summary: CodexSessionUsageSummary;
  events: CodexEventSummary;
  firstTimestamp?: string;
  lastTimestamp?: string;
  status: BenefitRecordStatus;
  diagnostics: BenefitDiagnostic[];
}

export interface CodexSessionScanOptions {
  projectDir: string;
  homeDir?: string;
  codexHome?: string;
  sinceMs: number;
  untilMs?: number;
  limit?: number;
  includeArchived?: boolean;
  maxFileBytes?: number;
  maxLineBytes?: number;
  maxFiles?: number;
  maxDepth?: number;
  useIndex?: boolean;
  indexPath?: string;
  indexRetentionDays?: number;
  signal?: AbortSignal;
}

export interface CodexSessionScanResult {
  codexHome: string;
  sessionRoots: string[];
  projectDir: string;
  sinceMs: number;
  untilMs: number;
  requestedLimit: number;
  candidates: CodexSessionFileAnalysis[];
  selected: CodexSessionSelection[];
  skipped: Array<{
    filePath: string;
    reason: string;
    diagnostics: BenefitDiagnostic[];
  }>;
  adapter: {
    id: string;
    version: string;
    observedEventTypes: string[];
  };
  counts: {
    discoveredFiles: number;
    projectCandidates: number;
    selectedFiles: number;
    skippedFiles: number;
    skippedByReason: Record<string, number>;
  };
  index: {
    enabled: boolean;
    path?: string;
    cacheHits: number;
    incrementalFiles: number;
    rebuiltFiles: number;
  };
  readBoundaries?: Array<{
    filePath: string;
    archived: boolean;
    size: number;
    mtimeMs: number;
    readOffset: number;
  }>;
  timings?: {
    totalMs: number;
    discoveryMs: number;
    parseMs: number;
    selectionMs: number;
    peakRssBytes?: number;
    peakHeapUsedBytes?: number;
  };
  diagnostics: BenefitDiagnostic[];
  generatedAt: string;
}

export interface OptimizationPlanEstimate {
  fixedEstimatedTokens?: number;
  fixedEstimatedPercent?: number;
  estimatedAfterTokens?: number;
  activationPotentialTokens?: number;
  billingMeasurement?: boolean;
}

export interface OptimizationPlanResource {
  id?: string;
  name?: string;
  sourcePath?: string;
  resource?: string;
  kind?: string;
  enabled?: boolean;
  estimatedTokens?: number;
  estimatedChars?: number;
  activationEstimatedTokens?: number;
  activationEstimatedChars?: number;
  estimateStatus?: string;
  scope?: string;
  controllable?: boolean;
  controlMethod?: string;
  requiresNewSession?: boolean;
  blockId?: CodexContextBlockId;
  rootAlias?: string;
}

export interface OfflinePlanSummary {
  historicalSkillCandidateCount: number;
  selectedSkillCount: number;
  recommendedPluginCount: number;
  skippedCandidateCount: number;
  skippedCandidates: Array<{
    source: 'skills_instructions' | 'recommended_plugins';
    name: string;
    reason: string;
  }>;
  observedBlocks: Record<string, {
    occurrences: number;
    estimatedTokens: number;
  }>;
  descriptionEstimates: {
    skillsInstructions: OfflineDescriptionEstimate;
    recommendedPlugins: OfflineDescriptionEstimate;
  };
}

export interface OptimizationPlan {
  schemaVersion?: number;
  kind?: string;
  id: string;
  createdAt?: string;
  projectDir?: string;
  platform?: string;
  scope?: string;
  snapshotId?: string;
  inventoryFingerprint?: string;
  confirmationDigest?: string;
  requestedIds?: string[];
  status?: string;
  coverage?: Record<string, unknown>;
  items?: OptimizationPlanResource[];
  operations?: Array<{
    id?: string;
    type?: string;
    requestedIds?: string[];
    affectedItems?: OptimizationPlanResource[];
    before?: {
      totalEstimatedTokens?: number;
      [key: string]: unknown;
    };
    after?: {
      totalEstimatedTokens?: number;
      [key: string]: unknown;
    };
  }>;
  baseline?: {
    totalEstimatedTokens?: number;
    activationTokens?: number;
    [key: string]: unknown;
  };
  estimate?: OptimizationPlanEstimate & {
    components?: Record<string, number>;
    method?: string;
  };
  offline?: OfflinePlanSummary;
  offlineHistory?: OfflineHistoryInput;
  sourcePath: string;
  sourceKind: 'plan' | 'operation' | 'explicit' | 'offline';
}

export interface BenefitPrice {
  model: string;
  provider: string;
  currency: string;
  inputPerMillion?: number;
  cachedInputPerMillion?: number;
  cacheWriteInputPerMillion?: number;
  outputPerMillion?: number;
  maxInputTokens?: number;
  inputTiers?: Array<{
    upToInputTokens?: number;
    inputPerMillion?: number;
    cachedInputPerMillion?: number;
    cacheWriteInputPerMillion?: number;
  }>;
  effectiveFrom?: string;
  source?: string;
  notes?: string;
}

export interface BenefitPriceTable {
  schemaVersion: 1;
  name: string;
  updatedAt: string;
  channel: string;
  serviceTier: string;
  unit: string;
  prices: BenefitPrice[];
}

export type BenefitEstimateStatus = 'estimated' | 'unknown' | 'not_applicable';

export interface BenefitUsageMetrics {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
  responseCount: number;
  coveredResponseCount: number;
  affectedResponseCount: number;
}

export interface BenefitCostMetrics {
  currency?: string;
  amount?: number;
  status: BenefitEstimateStatus;
  reason?: string;
  unpricedResponseCount?: number;
  ordinaryInputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  outputTokens?: number;
  priceModel?: string;
}

export interface BenefitModelCostBreakdown {
  model: string;
  responseCount: number;
  pricedResponseCount: number;
  baseline: BenefitCostMetrics;
  projected?: BenefitCostMetrics;
  savings?: number;
  savingsPercent?: number;
}

export interface BenefitScenario {
  id: 'persistent-context' | 'historical-cache' | 'cache-rebuild' | 'historical-replay';
  label: string;
  assumption: string;
  baseline: BenefitCostMetrics;
  projected: BenefitCostMetrics;
  savings?: number;
  savingsPercent?: number;
  parameters?: Record<string, string | number | boolean | null>;
  modelCosts?: BenefitModelCostBreakdown[];
}

export interface BenefitResponseEstimate {
  responseId: string;
  sessionId: string;
  threadId: string;
  turnId?: string;
  timestamp: string;
  model?: string;
  effort?: string;
  usageValidation?: CodexUsageRecord['usageValidation'];
  evidence?: 'static-plan' | 'historical-context' | 'text-reconstructed' | 'already-optimized' | 'catalog-projection' | 'unknown';
  contextSnapshotLine?: number;
  resourceMatches?: BenefitPlanResourceMatch[];
  before: CodexUsage;
  projectedAfter?: CodexUsage;
  estimatedInputSavings?: number;
  status: BenefitEstimateStatus;
  reason?: string;
  sourcePath: string;
  line: number;
}

export interface BenefitResourceContribution {
  resourceId: string;
  responseCount: number;
  inputSavings: number;
  interactionTokens: number;
}

export interface BenefitSnapshotReference {
  timestamp: string;
  sourcePath: string;
  line: number;
  full: boolean;
  recoverable: true;
  sourceKind?: CodexContextStateSnapshot['sourceKind'];
  role?: CodexContextBlockRole;
  stateKeys?: string[];
  agentsTextChars?: number;
  agentsTextSha256?: string;
  hostSkillsTextChars?: number;
  hostSkillsTextSha256?: string;
  agentsTruncated?: boolean;
  agentsComplete?: boolean;
  hostSkillsTruncated?: boolean;
  hostSkillsComplete?: boolean;
  contextTextChars?: number;
  contextTextSha256?: string;
  contextBlocksComplete?: boolean;
  contextBlocks?: Array<{
    id: CodexContextBlockId;
    tag: string;
    role: CodexContextBlockRole;
    activation: CodexContextBlockActivation;
    contentKind?: string;
    complete: boolean;
    estimatedChars: number;
    estimatedTokens?: number;
    textSha256?: string;
    controlMethod?: string;
    controllable?: boolean;
    recommendation: string;
    sourcePath: string;
    line: number;
  }>;
}

export interface BenefitPlanResourceMatch {
  id?: string;
  name?: string;
  resource?: string;
  sourcePath?: string;
  kind?: string;
  scope?: string;
  enabled?: boolean;
  controllable?: boolean;
  controlMethod?: string;
  requiresNewSession?: boolean;
  blockId?: CodexContextBlockId;
  rootAlias?: string;
  historicalState?: 'before' | 'after' | 'unknown';
  estimatedTokens?: number;
  estimatedChars?: number;
  activationEstimatedTokens?: number;
  estimateStatus?: string;
  status: 'matched' | 'mismatch' | 'unknown';
  reason: string;
}

export interface BenefitPlanCoverage {
  status: 'not_applicable' | 'static_only' | 'matched' | 'partial' | 'unknown';
  inventoryStatus: 'not_available' | 'matched' | 'mismatch' | 'unknown';
  historicalSnapshotCount: number;
  matchedResourceCount: number;
  unknownResourceCount: number;
  mismatchResourceCount: number;
  alreadyOptimizedResourceCount: number;
  alreadyOptimizedResponseCount: number;
  resources: BenefitPlanResourceMatch[];
}

export interface OfflineDescriptionEstimate {
  candidateCount: number;
  explicitlyReferencedCount: number;
  verifiedRemovableCount: number;
  verifiedRemovableTokens: number;
  unverifiedPotentialCount: number;
  unverifiedPotentialTokens: number;
  blockTokens: number;
  entryTokens: number;
  controlStatus: 'per-entry' | 'none-verified';
}

export interface BenefitReport {
  historyAnalysis?: OfflineHistoryAnalysis;
  schemaVersion: 1;
  kind: 'skill-doctor-codex-benefit-report';
  generatedAt: string;
  projectDir: string;
  codexHome: string;
  window: {
    since: string;
    until: string;
    timezone: string;
  };
  selection: {
    requestedLimit: number;
    selectedSessions: number;
    selectedResponseCount: number;
    associatedFileCount: number;
    includeArchived: boolean;
  };
  plan?: {
    id: string;
    sourcePath: string;
    sourceKind: OptimizationPlan['sourceKind'];
    status?: string;
    createdAt?: string;
    projectDir?: string;
    snapshotId?: string;
    inventoryFingerprint?: string;
    operationCount?: number;
    resources?: OptimizationPlanResource[];
    estimate?: OptimizationPlanEstimate;
    offline?: OfflinePlanSummary;
  };
  planCoverage: BenefitPlanCoverage;
  adapter: {
    id: string;
    version: string;
    observedEventTypes: string[];
  };
  scanCounts: CodexSessionScanResult['counts'];
  index: CodexSessionScanResult['index'];
  scanTimings?: CodexSessionScanResult['timings'];
  priceTable: BenefitPriceTable;
  baseline: BenefitUsageMetrics;
  projected: BenefitUsageMetrics;
  savings: {
    inputTokens?: number;
    inputTokenPercent?: number;
    totalTokens?: number;
    totalTokenPercent?: number;
    status: BenefitEstimateStatus;
  };
  scenarios: BenefitScenario[];
  modelCosts: BenefitModelCostBreakdown[];
  costCoverage: {
    pricedResponseCount: number;
    unpricedResponseCount: number;
    pricedInputTokens: number;
    totalInputTokens: number;
    responsePercent: number;
    inputTokenPercent: number;
  };
  sessions: Array<{
    sessionId: string;
    threadId: string;
    filePath: string;
    cwd?: string;
    lastTimestamp?: string;
    model?: string;
    responseCount: number;
    usage: CodexSessionUsageSummary;
    events: CodexEventSummary;
    contextSnapshotCount: number;
    cwdCount: number;
    status: BenefitRecordStatus;
    diagnostics: BenefitDiagnostic[];
  }>;
  responses: BenefitResponseEstimate[];
  resourceContributions: BenefitResourceContribution[];
  coverage: {
    responsePercent: number;
    inputTokenPercent: number;
    affectedResponsePercent: number;
    completeUsagePercent: number;
  };
  simulation: {
    method: 'proportional-static-estimate' | 'historical-context-text-diff' | 'latest-catalog-projection';
    source: 'skill-doctor-plan' | 'offline-context';
    tokenizer: ContextTokenizerSummary;
    outputHeldConstant: boolean;
    reexecutedCodex: false;
    cacheScenarioIds: Array<BenefitScenario['id']>;
  };
  evidence: {
    historicalContextSnapshotCount: number;
    historicalTextSnapshotCount: number;
    historicalTextTokenCount: number;
    historicalContextBlockCount: number;
    historicalContextBlockKinds: Record<string, number>;
    historicalContextBlockTokenCounts: Record<string, number>;
    historicalContextBlockTokenCount: number;
    textReconstructedResponseCount: number;
    textReconstructedSavingsTokens: number;
    tokenizer: ContextTokenizerSummary;
    dynamicResourceTextReconstructed: boolean;
    planEstimateEvidence: 'static-optimizer-estimate' | 'offline-context-reconstruction' | 'none';
  };
  provenance: {
    sampleResponseIds: string[];
    readBoundaries: Array<{
      filePath: string;
      archived: boolean;
      size: number;
      mtimeMs: number;
      readOffset: number;
    }>;
    contextSnapshots: BenefitSnapshotReference[];
  };
  diagnostics: BenefitDiagnostic[];
  limitations: string[];
}
