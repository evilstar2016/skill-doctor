import type { SkillProvenance } from './skill';

export type RuleId = 'shell-exec' | 'destructive' | 'secret-leak' | 'network-call' | 'bundled-executable' | 'unscanned-content';

export interface AuditFinding {
  skillName: string;
  sourcePath: string;
  platform: string;
  scope: 'global' | 'project';
  provenance?: SkillProvenance;
  ruleId: RuleId;
  severity: 'high' | 'med' | 'low';
  summary: string;
  matchedText: string;
}

export interface AiFinding {
  source: 'ai';
  skillName: string;
  sourcePath: string;
  platform: string;
  scope: 'global' | 'project';
  provenance?: SkillProvenance;
  code: string;
  severity: 'high' | 'med' | 'low';
  title: string;
  detail: string;
  evidence?: string;
}

export interface SkippedDirectory {
  skillName: string;
  sourcePath: string;
  directory: string; // relative to the skill directory, e.g. node_modules
}

export interface AuditResult {
  scanned: number;
  findings: AuditFinding[];
  aiFindings?: AiFinding[];
  skippedDirectories?: SkippedDirectory[];
  summary: Record<'high' | 'med' | 'low', number>;
}
