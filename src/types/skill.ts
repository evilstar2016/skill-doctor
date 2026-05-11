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

export interface ConflictPair {
  a: SkillRecord;
  b: SkillRecord;
  kind: ConflictKind;
  similarity: number;
  sharedTokens: string[];
  severity: Severity;
}