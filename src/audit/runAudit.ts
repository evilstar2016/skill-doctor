import type { AuditFinding, AuditResult } from '../types/audit';
import type { SkillRecord } from '../types/skill';
import { RULES } from './rules';

export function runAudit(skills: SkillRecord[]): AuditResult {
  const findings: AuditFinding[] = [];

  for (const skill of skills) {
    const text = [skill.name, skill.description, ...skill.triggers].join(' ');

    for (const rule of RULES) {
      for (const pattern of rule.patterns) {
        const match = pattern.exec(text);
        if (match) {
          findings.push({
            skillName: skill.name,
            sourcePath: skill.sourcePath,
            platform: skill.platform,
            scope: skill.scope,
            ruleId: rule.ruleId,
            severity: rule.severity,
            matchedText: match[0].trim(),
            summary: `"${match[0].trim()}" — ${rule.label}`,
          });
          break; // one finding per rule per skill
        }
      }
    }
  }

  const summary: Record<'high' | 'med' | 'low', number> = { high: 0, med: 0, low: 0 };
  for (const f of findings) {
    summary[f.severity]++;
  }

  return { scanned: skills.length, findings, summary };
}
