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

export interface ContextCostItem {
  name: string;
  sourcePath: string;
  platform: Platform;
  scope: Scope;
  source?: ContextCostSource;
  kind: ContextInjectionKind;
  estimatedTokens: number;
  estimatedChars: number;
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
}

export interface ContextCostResult {
  summary: ContextCostSummary;
  items: ContextCostItem[];
}
