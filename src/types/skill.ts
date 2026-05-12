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
  | 'unknown';

export type Scope = 'global' | 'project';

export type Severity = 'high' | 'med' | 'low';

export type ConflictKind = 'conflict' | 'duplicate';

export type ConflictDetectionStrategy = 'token' | 'embedding';

export type ConflictDetectionMethod = 'duplicate-name' | 'token' | 'embedding';

export type Confidence = 'high' | 'low';

export interface SkillFile {
  filePath: string;
  platform: Platform;
  scope: Scope;
  confidence: Confidence;
}

export interface SkillRecord {
  name: string;
  sourcePath: string;
  platform: Platform;
  scope: Scope;
  description: string;
  triggers: string[];
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
}
