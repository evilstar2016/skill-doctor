import type { Platform, Scope } from './skill';

export type ContextCostGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export type ContextInjectionKind =
  | 'claude-skill-description'
  | 'always-on-file'
  | 'skill-metadata';

export interface ContextCostItem {
  name: string;
  sourcePath: string;
  platform: Platform;
  scope: Scope;
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
}

export interface ContextCostResult {
  summary: ContextCostSummary;
  items: ContextCostItem[];
}
