import type { Platform, Scope } from './skill';

export type ContextCostGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type ContextCostSource = 'skill' | 'mcp';

export type ContextInjectionKind =
  | 'claude-skill-description'
  | 'agent-skill-description'
  | 'cursor-rule-file'
  | 'copilot-instruction-file'
  | 'always-on-file'
  | 'mcp-server-config'
  | 'skill-metadata';

export type ContextActivation =
  | 'startup'
  | 'always-on'
  | 'on-demand'
  | 'file-scoped'
  | 'manual';

export type ContextBudgetScope =
  | 'startup-selection'
  | 'always-on'
  | 'activation'
  | 'none';

export interface ContextCostOfficialLimit {
  kind: 'chars' | 'tokens';
  value: number;
  appliesTo: string;
}

export interface ContextCostItem {
  name: string;
  sourcePath: string;
  platform: Platform;
  scope: Scope;
  source?: ContextCostSource;
  kind: ContextInjectionKind;
  estimatedTokens: number;
  estimatedChars: number;
  activationEstimatedTokens: number;
  activationEstimatedChars: number;
  activation: ContextActivation;
  budgetScope: ContextBudgetScope;
  confidence: 'high' | 'low';
  officialLimit?: ContextCostOfficialLimit;
  recommendation: string;
}

export interface ContextCostSummary {
  totalEstimatedTokens: number;
  budgetTokens: number;
  grade: ContextCostGrade;
  overBudget: boolean;
  scanned: number;
  projectPath?: string;
  byPlatform: ContextCostPlatformSummary[];
}

export interface ContextCostPlatformSummary {
  platform: Platform;
  items: number;
  estimatedTokens: number;
  estimatedChars: number;
  startupSelectionTokens: number;
  alwaysOnTokens: number;
  activationTokens: number;
  budgetTokens: number;
  grade: ContextCostGrade;
  overBudget: boolean;
}

export interface ContextCostResult {
  summary: ContextCostSummary;
  items: ContextCostItem[];
}
