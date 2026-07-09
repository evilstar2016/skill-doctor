import type { Platform, Scope } from './skill';

export type ContextCostGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type ContextCostSource = 'skill' | 'mcp' | 'agents' | 'plugin' | 'memory';
export type ContextResource = 'agents' | 'skill' | 'mcp' | 'plugin' | 'memory';
export type ContextEstimateStatus = 'estimated' | 'unknown' | 'unsupported';

export type ContextInjectionKind =
  | 'claude-skill-description'
  | 'agent-skill-description'
  | 'cursor-rule-file'
  | 'copilot-instruction-file'
  | 'copilot-prompt-file'
  | 'always-on-file'
  | 'agents-chain'
  | 'codex-skill-list'
  | 'mcp-server-config'
  | 'mcp-instructions'
  | 'mcp-tool-list'
  | 'plugin-skill-list'
  | 'plugin-mcp-tool-list'
  | 'memory-context-unknown'
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
  id?: string;
  name: string;
  sourcePath: string;
  platform: Platform;
  scope: Scope;
  source?: ContextCostSource;
  resource?: ContextResource;
  configSource?: string;
  kind: ContextInjectionKind;
  estimatedTokens: number;
  estimatedChars: number;
  activationEstimatedTokens: number;
  activationEstimatedChars: number;
  activation: ContextActivation;
  budgetScope: ContextBudgetScope;
  confidence: 'high' | 'low';
  enabled?: boolean;
  controllable?: boolean;
  controlPath?: string;
  controlMethod?: string;
  estimateStatus?: ContextEstimateStatus;
  officialLimit?: ContextCostOfficialLimit;
  recommendation: string;
}

export interface ContextCostSummary {
  totalEstimatedTokens: number;
  disabledEstimatedTokens?: number;
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

export interface ContextResourceRecord {
  source: ContextCostSource;
  id: string;
  name: string;
  sourcePath: string;
  platform: Platform;
  scope: Scope;
  resource: ContextResource;
  kind: ContextInjectionKind;
  text: string;
  activationText?: string;
  activation: ContextActivation;
  budgetScope: ContextBudgetScope;
  confidence: 'high' | 'low';
  enabled?: boolean;
  configSource?: string;
  controllable?: boolean;
  controlPath?: string;
  controlMethod?: string;
  estimateStatus?: ContextEstimateStatus;
  recommendation: string;
  officialLimit?: ContextCostOfficialLimit;
}
