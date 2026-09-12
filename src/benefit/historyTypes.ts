import type { BenefitModelCostBreakdown, CodexUsage } from './types';

export type CatalogKind = 'skills_instructions' | 'recommended_plugins';

export interface CatalogSource {
  kind: CatalogKind;
  sessionId: string;
  timestamp: string;
  sourcePath: string;
  line: number;
  sha256: string;
}

export interface HistoryCandidate {
  kind: CatalogKind;
  name: string;
  id: string;
  sourcePath?: string;
  explicitMentionCount: number;
  activationCount: number;
  observedReadCount: number;
  usedSessionCount: number;
  lastUsedAt?: string;
  evidence: Array<{ sessionId: string; sourcePath: string; line: number; kind: 'mention' | 'activation' | 'read' }>;
  recommendation: 'retain' | 'review-disable' | 'unknown';
  control: 'source-supported' | 'already-disabled' | 'unverified';
  controlMethod?: string;
  reason: string;
}

export interface HistoryWorkloadRow {
  responseId: string;
  turnId?: string;
  timestamp: string;
  model?: string;
  before: CodexUsage;
  descriptionTokens?: number;
  replayTokens?: number;
  cacheAttribution?: { lower: number; upper: number; cachedRead: number; cacheWrite: number; ordinary: number };
}

export interface HistoryTurn {
  turnId: string;
  responseCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  descriptionTokens: number;
  unknownResponses: number;
  cachedReadSavings: number;
  cacheWriteSavings: number;
  ordinarySavings: number;
}

export interface OfflineHistoryAnalysis {
  mode: 'latest-catalog-projection';
  assumption: string;
  historyCoverage: { since: string; until: string; sessionCount: number; fileCount: number; includesArchived: boolean; limited: boolean; incompleteFiles: number; userMessages: number };
  catalogSources: CatalogSource[];
  usageProfile: HistoryCandidate[];
  baselineSession?: { sessionId: string; sourcePath: string; firstTimestamp?: string; lastTimestamp?: string; rule: string; userMessageCount: number; userMessageItemCount: number; distinctTurnCount: number; completedTurnCount: number; responseCount: number };
  childUsage: { responseCount: number; inputTokens: number; cachedInputTokens: number };
  childModelCosts?: BenefitModelCostBreakdown[];
  descriptionTokensPerResponse?: number;
  blockDeltas: Partial<Record<CatalogKind, number>>;
  pluginControl: { perId: string; wholeBlock: string; runtimeVerified: false; replacementRisk: boolean; wholeBlockSelected: boolean; impact: string };
  firstResponse?: HistoryWorkloadRow;
  firstInteraction?: HistoryTurn;
  turnBreakdown: HistoryTurn[];
  responses: HistoryWorkloadRow[];
  historicalReplay: { inputTokens: number; coveredResponses: number; unknownResponses: number };
}

/** Internal, unredacted text is never copied into the public benefit report. */
export interface OfflineHistoryInput {
  analysis: OfflineHistoryAnalysis;
  catalogs: Array<{ source: CatalogSource; text: string }>;
}
