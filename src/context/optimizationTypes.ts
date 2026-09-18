import type { CodexUsage } from '../benefit/types';

export type OptimizationTarget = 'skill-catalog' | 'memory';
export interface OptimizationSuggestion {
  id: OptimizationTarget;
  scope: 'project' | 'user';
  configPath: string;
  configKey: string;
  configuredOff: boolean;
  available: boolean;
  reason?: 'configured-off' | 'incomplete-header' | 'unsupported-version' | 'absent' | 'config-override';
  tokens?: number;
  cost?: { lower: number; upper: number; currency: string };
  cumulative?: {
    tokens?: number;
    cost?: { lower: number; upper: number; currency: string };
    coveredResponses: number;
    pricedResponses: number;
  };
}
export interface OptimizationSession {
  id: string;
  timestamp: string;
  version?: string;
  model?: string;
  sourcePath: string;
  completeHeader: boolean;
  usage?: CodexUsage;
  responseCount: number;
  turnCount?: number;
  cost?: number;
  costCoverage: number;
  suggestions: OptimizationSuggestion[];
}
export interface OptimizationOverview {
  projectDir: string;
  generatedAt: string;
  sessions: OptimizationSession[];
  priceDate: string;
  diagnostics: string[];
}
export interface OptimizationPreview {
  target: OptimizationTarget;
  scope: 'project' | 'user';
  configPath: string;
  configKey: string;
  before?: boolean;
  after: false;
  confirmation: string;
}
export interface OptimizationOperation {
  id: string;
  projectDir: string;
  target: OptimizationTarget;
  configPath: string;
  createdAt: string;
  version: string;
  status: 'pending' | 'restored';
}
export interface OptimizationVerification {
  status: 'removed' | 'present' | 'unknown';
  reason: string;
  sessionId?: string;
  sourcePath?: string;
}
