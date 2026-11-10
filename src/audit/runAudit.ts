import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { AuditFinding, AuditResult, SkippedDirectory } from '../types/audit';
import type { SkillRecord } from '../types/skill';
import { collectBundledFiles, MAX_SCRIPT_BYTES } from './bundledFiles';
import { BUNDLED_EXECUTABLE_RULE, RULES, UNSCANNED_CONTENT_RULE } from './rules';

export interface AuditOptions {
  // Also walk node_modules, .git and .skill-doctor inside skills. Slow on large trees, so opt-in.
  includeHeavyDirectories?: boolean;
}

const UNSCANNED_REASONS = {
  oversized: `file larger than ${MAX_SCRIPT_BYTES / 1_000_000} MB`,
  'directory-link': 'symbolic link to a directory is not followed',
} as const;

function readScript(path: string): string {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return '';
  }
}

function moreSuffix(total: number): string {
  return total > 1 ? ` (+${total - 1} more)` : '';
}

function makeFinding(
  skill: SkillRecord,
  rule: { ruleId: AuditFinding['ruleId']; severity: AuditFinding['severity'] },
  matchedText: string,
  summary: string,
): AuditFinding {
  return {
    skillName: skill.name,
    sourcePath: skill.sourcePath,
    platform: skill.platform,
    scope: skill.scope,
    provenance: skill.provenance,
    ruleId: rule.ruleId,
    severity: rule.severity,
    matchedText,
    summary,
  };
}

export function runAudit(skills: SkillRecord[], options: AuditOptions = {}): AuditResult {
  const findings: AuditFinding[] = [];
  const skippedDirectories: SkippedDirectory[] = [];

  for (const skill of skills) {
    const text = [skill.name, skill.description, ...skill.triggers].join(' ');
    // Only a SKILL.md owns its directory; other platforms' files share theirs.
    const skillDir = basename(skill.sourcePath) === 'SKILL.md' ? dirname(skill.sourcePath) : undefined;
    const bundled = skillDir ? collectBundledFiles(skillDir, options) : undefined;

    for (const rule of RULES) {
      // Manifest text first, then bundled scripts; one finding per rule per skill.
      const sources = [{ file: undefined as string | undefined, content: text }];
      for (const file of bundled?.scripts ?? []) sources.push({ file, content: '' });

      for (const source of sources) {
        const content = source.file && skillDir ? readScript(join(skillDir, source.file)) : source.content;
        const match = content ? rule.patterns.map((pattern) => pattern.exec(content)).find(Boolean) : undefined;
        if (!match) continue;
        const matched = match[0].trim();
        const where = source.file ? ` (in ${source.file})` : '';
        findings.push(makeFinding(skill, rule, matched, `"${matched}" — ${rule.label}${where}`));
        break;
      }
    }

    if (!bundled) continue;

    const [opaque] = bundled.opaque;
    if (opaque) {
      const { label } = BUNDLED_EXECUTABLE_RULE;
      findings.push(makeFinding(skill, BUNDLED_EXECUTABLE_RULE, opaque, `"${opaque}" — ${label}${moreSuffix(bundled.opaque.length)}`));
    }

    const [unscanned] = bundled.unscanned;
    if (unscanned) {
      const summary = `"${unscanned.path}" — ${UNSCANNED_CONTENT_RULE.label} (${UNSCANNED_REASONS[unscanned.reason]})${moreSuffix(bundled.unscanned.length)}`;
      findings.push(makeFinding(skill, UNSCANNED_CONTENT_RULE, unscanned.path, summary));
    }

    for (const directory of bundled.skippedDirectories) {
      skippedDirectories.push({ skillName: skill.name, sourcePath: skill.sourcePath, directory });
    }
  }

  const summary: Record<'high' | 'med' | 'low', number> = { high: 0, med: 0, low: 0 };
  for (const f of findings) {
    summary[f.severity]++;
  }

  return { scanned: skills.length, findings, summary, ...(skippedDirectories.length > 0 ? { skippedDirectories } : {}) };
}
