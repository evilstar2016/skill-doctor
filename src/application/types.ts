import type { AuditFinding, AiFinding } from '../types/audit';
import type { CleanupSuggestion } from '../types/cleanup';
import type { ContextCostResult, ContextResource } from '../types/context';
import type { DiffResult } from '../diff/types';
import type { GroupResult, SkillExplanation } from '../types/explain';
import type { RegistryEntry } from '../types/install';
import type { DetectedAgent } from '../discovery/detectAgents';
import type { ConflictAnalysis, ConflictDetectionStrategy, ConflictPair, Platform, Scope, Severity, SkillRecord } from '../types/skill';

export type HealthCheckScope = Scope | 'all';
export type ScanPhase = 'discovering' | 'conflicts' | 'audit' | 'context' | 'grouping' | 'complete';
export type UiIssueKind = 'security' | 'conflict' | 'duplicate' | 'context';
export type UiIssueSeverity = Severity | 'info';
export type UiResourceKind = ContextResource | 'instruction' | 'rule' | 'prompt' | 'unknown';

export interface HealthCheckOptions {
  projectDir: string;
  scope?: HealthCheckScope;
  platform?: Platform | null;
  includeContext?: boolean;
  includeDisabled?: boolean;
  includeCache?: boolean;
  discoverMcpTools?: boolean;
  useAiAudit?: boolean;
  conflictStrategy?: ConflictDetectionStrategy;
  analyzeConflicts?: boolean;
  budgetTokens?: number;
  tokenizer?: 'openai' | 'approx';
  tokenizerModel?: string;
  homeDir?: string;
  signal?: AbortSignal;
}

export interface ScanProgressEvent {
  phase: ScanPhase;
  message: string;
  completed: number;
  total: number;
}

export interface ScanWarning {
  id: string;
  phase: ScanPhase;
  code: string;
  message: string;
  recoverable: boolean;
  resourceId?: string;
}

export interface UiResource {
  id: string;
  name: string;
  kind: UiResourceKind;
  kindLabel: string;
  sourcePath: string;
  sourcePaths?: string[];
  platform: Platform;
  scope: Scope;
  shared: boolean;
  consumers: Array<{
    platform: Platform;
    scope: Scope;
    enabled?: boolean;
    activation?: string;
    fixedTokens: number;
    activationTokens: number;
  }>;
  description?: string;
  triggers: string[];
  enabled?: boolean;
  controllable: boolean;
  activation?: string;
  fixedTokens: number;
  activationTokens: number;
  confidence?: 'high' | 'low';
  installSource?: string;
  repository?: string;
  author?: string;
  issueIds: string[];
  status: 'healthy' | 'attention' | 'disabled' | 'unknown';
  recommendation?: string;
  controlMethod?: string;
  estimateStatus?: 'estimated' | 'unknown' | 'unsupported';
  installed?: RegistryEntry;
}

export interface UiEvidence {
  label: string;
  value: string;
  path?: string;
}

export interface UiIssue {
  id: string;
  kind: UiIssueKind;
  severity: UiIssueSeverity;
  title: string;
  summary: string;
  resourceIds: string[];
  resourceNames: string[];
  evidence: UiEvidence[];
  recommendation?: string;
  detectionMethod?: string;
  similarity?: number;
  analysis?: ConflictAnalysis;
  cleanup?: CleanupSuggestion;
  sourceFinding?: AuditFinding | AiFinding;
}

export interface UiCapabilities {
  aiAuditConfigured: boolean;
  embeddingConfigured: boolean;
  canToggleCodexResources: boolean;
  canExecuteCleanup: boolean;
  canInstall: boolean;
  canUninstall: boolean;
  canExportDashboard: boolean;
}

export interface DoctorSnapshot {
  id: string;
  generatedAt: string;
  durationMs: number;
  status: 'complete' | 'partial';
  target: {
    projectDir: string;
    scope: HealthCheckScope;
    platform: Platform | null;
  };
  summary: {
    resources: number;
    issues: number;
    high: number;
    medium: number;
    low: number;
    conflicts: number;
    duplicates: number;
    security: number;
    fixedTokens: number;
    activationTokens: number;
    disabledResources: number;
    platforms: Partial<Record<Platform, number>>;
    scopes: Partial<Record<Scope, number>>;
  };
  resources: UiResource[];
  issues: UiIssue[];
  skills: SkillRecord[];
  conflicts: ConflictPair[];
  audit: {
    scanned: number;
    findings: AuditFinding[];
    aiFindings: AiFinding[];
    summary: Record<Severity, number>;
  };
  context?: ContextCostResult;
  groups?: GroupResult;
  warnings: ScanWarning[];
  capabilities: UiCapabilities;
}

export interface BootstrapPayload {
  version: string;
  projectDir: string;
  configPath: string;
  defaultScope: HealthCheckScope;
  supportedPlatforms: Platform[];
  detectedAgents: DetectedAgent[];
  capabilities: UiCapabilities;
  registry: RegistryEntry[];
  snapshot: DoctorSnapshot | null;
}

export interface ResourceDetailPayload {
  resource: UiResource;
  skill?: SkillExplanation;
  issues: UiIssue[];
}

export interface ComparePayload {
  result: DiffResult;
}
