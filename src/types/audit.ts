export type RuleId = 'shell-exec' | 'destructive' | 'secret-leak' | 'network-call';

export interface AuditFinding {
  skillName: string;
  sourcePath: string;
  platform: string;
  scope: 'global' | 'project';
  ruleId: RuleId;
  severity: 'high' | 'med' | 'low';
  summary: string;
  matchedText: string;
}

export interface AuditResult {
  scanned: number;
  findings: AuditFinding[];
  summary: Record<'high' | 'med' | 'low', number>;
}
