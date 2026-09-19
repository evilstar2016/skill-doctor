import type { CodexUsage } from '../benefit/types';

export type OptimizationTarget = 'skill-catalog' | 'memory' | 'plugins';
export type OptimizationPeriod = 'week' | 'month';
export type OptimizationPricingMode = 'max' | 'actual';
export interface OptimizationRecommendation {
  reason: 'explicit-repeat' | 'no-observed-use' | 'insufficient-evidence';
  explicitRequests: number;
  sessions: number;
  messages: number;
}
export interface OptimizationSuggestion {
  id: OptimizationTarget;
  scope: 'project' | 'user';
  configPath: string;
  configKey: string;
  configuredOff: boolean;
  available: boolean;
  canEnable?: boolean;
  versionWarning?: boolean;
  reason?: 'configured-off' | 'incomplete-header' | 'unsupported-version' | 'absent' | 'config-override';
  tokens?: number;
  cost?: { lower: number; upper: number; currency: string };
  actualCost?: { lower: number; upper: number; currency: string };
  cumulative?: {
    tokens?: number;
    cost?: { lower: number; upper: number; currency: string };
    actualCost?: { lower: number; upper: number; currency: string };
    coveredResponses: number;
    pricedResponses: number;
    actualPricedResponses?: number;
  };
}
export interface OptimizationSession {
  id: string;
  timestamp: string;
  version?: string;
  model?: string;
  sourcePath: string;
  completeHeader: boolean;
  headerBlocks?: Array<{ kind: string; excerpt: string; characters: number; target?: OptimizationTarget }>;
  usage?: CodexUsage;
  responseCount: number;
  turnCount?: number;
  cost?: number;
  actualCost?: number;
  costCoverage: number;
  actualCostCoverage?: number;
  suggestions: OptimizationSuggestion[];
}
export interface OptimizationOverview {
  projectDir: string;
  generatedAt: string;
  period: OptimizationPeriod;
  periodStart: string;
  periodEnd: string;
  maxPriceModel: string;
  sessions: OptimizationSession[];
  priceDate: string;
  diagnostics: string[];
  recommendations?: Partial<Record<OptimizationTarget, OptimizationRecommendation>>;
}
export interface OptimizationPreview {
  targets: OptimizationTarget[];
  scope: 'project' | 'user' | 'mixed';
  configPaths: string[];
  configKeys: string[];
  before: Partial<Record<OptimizationTarget, boolean>>;
  after: boolean;
  confirmation: string;
}
export interface OptimizationOperation {
  id: string;
  projectDir: string;
  targets: OptimizationTarget[];
  configPaths: string[];
  createdAt: string;
  version: string;
  enabled?: boolean;
  status: 'pending' | 'restored';
  /** Legacy fields are read only for operations created before multi-select. */
  target?: OptimizationTarget;
  configPath?: string;
}
export interface OptimizationVerification {
  status: 'removed' | 'present' | 'unknown';
  reason: string;
  sessionId?: string;
  sourcePath?: string;
  matched?: boolean;
  targets?: Array<{ id: OptimizationTarget; status: 'removed' | 'present' }>;
}
