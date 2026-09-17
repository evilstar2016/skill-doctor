import type { Platform, Scope } from './skill';

export type ContextCostGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type ContextCostSource = 'skill' | 'mcp' | 'agents' | 'plugin' | 'memory';
export type ContextResource = 'agents' | 'skill' | 'mcp' | 'plugin' | 'memory';
export type ContextEstimateStatus = 'estimated' | 'unknown' | 'unsupported';
export type ContextTokenizerMode = 'openai' | 'approx';
export type CodexContextEvidenceLevel = 'text-observed' | 'runtime-item-observed' | 'fresh-session-verified';
export type CodexControlStatus = 'configured' | 'runtime-verified' | 'host-overridden' | 'unknown' | 'not-controllable';
export type CodexContextObservationStatus = 'present' | 'absent' | 'unknown';

export type CodexContextBlockId =
  | 'skills_instructions'
  | 'recommended_plugins'
  | 'permissions_instructions'
  | 'collaboration_mode'
  | 'apps_instructions'
  | 'plugins_instructions'
  | 'environment_context'
  | 'app_context';

export type CodexContextBlockRole = 'developer' | 'user' | 'unknown';
export type CodexContextBlockActivation = 'initial-context' | 'world-state' | 'unknown';

export interface ContextTokenizerSummary {
  mode: ContextTokenizerMode;
  model?: string;
  encoding?: string;
  fallback?: boolean;
}

export interface CodexSkillRootAlias {
  alias: string;
  path: string;
}

export interface CodexAvailableSkillEntry {
  name: string;
  description: string;
}

export interface CodexRecommendedPluginEntry {
  name: string;
  id: string;
}

export interface CodexContextProvenance {
  sourcePath: string;
  line: number;
  role?: CodexContextBlockRole;
  contentItemKind?: string;
  contentItemIndex?: number;
  sessionId?: string;
  threadId?: string;
  timestamp?: string;
}

export interface CodexContextBlockVerification {
  id: CodexContextBlockId;
  status: CodexContextObservationStatus;
  evidenceLevel?: CodexContextEvidenceLevel;
  sourcePath?: string;
  line?: number;
  sessionId?: string;
  threadId?: string;
  reason: string;
}

export interface CodexContextBlockObservation {
  id: CodexContextBlockId;
  tag: string;
  role: CodexContextBlockRole;
  contentKind?: string;
  activation: CodexContextBlockActivation;
  text: string;
  estimatedTokens: number;
  estimatedChars: number;
  complete: boolean;
  startOffset: number;
  endOffset: number;
  rootAliases?: CodexSkillRootAlias[];
  availableSkills?: CodexAvailableSkillEntry[];
  recommendedPlugins?: CodexRecommendedPluginEntry[];
  controlMethod?: string;
  controllable?: boolean;
  controlStatus?: CodexControlStatus;
  evidenceLevel?: CodexContextEvidenceLevel;
  observationStatus?: CodexContextObservationStatus;
  provenance?: CodexContextProvenance;
  recommendation: string;
}

export interface CodexContextBlockAnalysis {
  sourcePath?: string;
  textChars: number;
  totalEstimatedTokens: number;
  tokenizer: ContextTokenizerSummary;
  blocks: CodexContextBlockObservation[];
  diagnostics: string[];
  evidenceLevel?: CodexContextEvidenceLevel;
  provenance?: CodexContextProvenance;
  verification?: CodexContextBlockVerification[];
}

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
  sourcePaths?: string[];
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
  controlStatus?: CodexControlStatus;
  officialLimit?: ContextCostOfficialLimit;
  recommendation: string;
}

export interface ContextCostSummary {
  totalEstimatedTokens: number;
  disabledEstimatedTokens?: number;
  budgetTokens: number;
  scope?: Scope | 'all';
  grade: ContextCostGrade;
  overBudget: boolean;
  scanned: number;
  projectPath?: string;
  tokenizer: ContextTokenizerSummary;
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
  disabledItems?: ContextCostItem[];
  resources?: Record<ContextResource, ContextCostItem[]>;
  disabledResources?: Record<ContextResource, ContextCostItem[]>;
  catalog?: CodexPluginCacheCatalog;
}

export interface CodexPluginCacheCatalog {
  cacheRoot: string;
  status: 'cached';
  countedInContextCost: false;
  summary: {
    plugins: number;
    uiEntries: number;
    explicitOnlyEntries: number;
  };
  plugins: CodexCachedPlugin[];
}

export interface CodexCachedPlugin {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version?: string;
  cacheSource: string;
  manifestPath: string;
  iconPath?: string;
  status: 'cached';
  countedInContextCost: false;
  entries: CodexCachedPluginUiEntry[];
}

export interface CodexCachedPluginUiEntry {
  id: string;
  skillName: string;
  displayName: string;
  description: string;
  sourcePath: string;
  iconPath?: string;
  defaultPrompt?: string;
  invocation: 'implicit' | 'explicit-only' | 'unknown';
  status: 'cached';
  countedInContextCost: false;
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
  controlStatus?: CodexControlStatus;
  recommendation: string;
  officialLimit?: ContextCostOfficialLimit;
}
