import { readdirSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import type { AuditFinding, AuditResult } from '../types/audit';
import type { SkillRecord } from '../types/skill';
import { BUNDLED_EXECUTABLE_RULE, RULES } from './rules';

// Extensions of compiled or opaque artifacts that the text rules cannot read.
const OPAQUE_EXECUTABLE_EXTENSIONS = new Set([
  '.pyc', '.pyo', '.so', '.dylib', '.dll', '.exe', '.class', '.jar', '.node', '.wasm',
]);
const SKIPPED_DIRECTORIES = new Set(['.git', '.skill-doctor', 'node_modules']);

// Returns the first bundled artifact (relative path) that cannot be audited as text.
function findOpaqueExecutable(dir: string, prefix = ''): string | undefined {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const found = findOpaqueExecutable(join(dir, entry.name), relativePath);
      if (found) return found;
    } else if (entry.isFile() && OPAQUE_EXECUTABLE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      return relativePath;
    }
  }
  return undefined;
}

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
            provenance: skill.provenance,
            ruleId: rule.ruleId,
            severity: rule.severity,
            matchedText: match[0].trim(),
            summary: `"${match[0].trim()}" — ${rule.label}`,
          });
          break; // one finding per rule per skill
        }
      }
    }

    // Only a SKILL.md owns its directory; other platforms' files share theirs.
    if (basename(skill.sourcePath) === 'SKILL.md') {
      const opaque = findOpaqueExecutable(dirname(skill.sourcePath));
      if (opaque) {
        findings.push({
          skillName: skill.name,
          sourcePath: skill.sourcePath,
          platform: skill.platform,
          scope: skill.scope,
          provenance: skill.provenance,
          ruleId: BUNDLED_EXECUTABLE_RULE.ruleId,
          severity: BUNDLED_EXECUTABLE_RULE.severity,
          matchedText: opaque,
          summary: `"${opaque}" — ${BUNDLED_EXECUTABLE_RULE.label}`,
        });
      }
    }
  }

  const summary: Record<'high' | 'med' | 'low', number> = { high: 0, med: 0, low: 0 };
  for (const f of findings) {
    summary[f.severity]++;
  }

  return { scanned: skills.length, findings, summary };
}
