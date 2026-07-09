export type Platform =
  | 'claude'
  | 'cursor'
  | 'copilot'
  | 'codex'
  | 'gemini'
  | 'windsurf'
  | 'trae'
  | 'opencode'
  | 'kiro'
  | 'openclaw'
  | 'hermes'
  | 'unknown';

export type Scope = 'global' | 'project';

export type Severity = 'high' | 'med' | 'low';

export type ConflictKind = 'conflict' | 'duplicate';

export type ConflictDetectionStrategy = 'token' | 'embedding';

export type ConflictDetectionMethod = 'duplicate-name' | 'token' | 'embedding';

export type Confidence = 'high' | 'low';

export interface SkillProvenance {
  repository?: string;
  author?: string;
  installSource: string;
  confidence: Confidence;
}

export interface SkillFile {
  filePath: string;
  platform: Platform;
  scope: Scope;
  confidence: Confidence;
  installSource: string;
}

export interface SkillRecord {
  id?: string;
  name: string;
  sourcePath: string;
  platform: Platform;
  scope: Scope;
  description: string;
  triggers: string[];
  context?: {
    resource?: 'agents' | 'skill' | 'mcp' | 'plugin' | 'memory';
    configSource?: string;
    enabled?: boolean;
    controllable?: boolean;
    controlPath?: string;
    controlMethod?: string;
    estimateStatus?: 'estimated' | 'unknown' | 'unsupported';
  };
  provenance?: SkillProvenance;
}

export interface ConflictEmbeddingProvider {
  modelId: string;
  cacheKey?: string;
  embed(text: string): Promise<number[]>;
}

export interface ConflictEmbeddingCache {
  get(text: string): number[] | null;
  set(text: string, embedding: readonly number[]): void;
}

export interface ConflictAnalysis {
  summary: string;
  overlapAreas: string[];
  boundaries: string[];
  strengthsA: string[];
  strengthsB: string[];
  verdict: 'conflicting' | 'adjacent' | 'distinct';
  remediation?: string;
}

export interface ConflictPair {
  a: SkillRecord;
  b: SkillRecord;
  kind: ConflictKind;
  similarity: number;
  sharedTokens: string[];
  severity: Severity;
  detectionMethod?: ConflictDetectionMethod;
  analysis?: ConflictAnalysis;
  remediation?: string;
}

export interface ConflictDetectionOptions {
  strategy?: ConflictDetectionStrategy;
  threshold?: number;
  modelId?: string;
  baseUrl?: string;
  apiKey?: string;
  cacheDir?: string;
  provider?: ConflictEmbeddingProvider;
  cache?: ConflictEmbeddingCache;
  analyze?: boolean;
  analysisBaseUrl?: string;
  analysisModelId?: string;
  analysisApiKey?: string;
}
