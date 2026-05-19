import type { SkillProvenance } from './skill';

export type RuleId = 'shell-exec' | 'destructive' | 'secret-leak' | 'network-call';

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

export interface AuditResult {
  scanned: number;
  findings: AuditFinding[];
  aiFindings?: AiFinding[];
  summary: Record<'high' | 'med' | 'low', number>;
}
