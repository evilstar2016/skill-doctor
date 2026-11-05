import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import type { AuditFinding, AuditResult } from '../types/audit';
import type { SkillRecord } from '../types/skill';
import { BUNDLED_EXECUTABLE_RULE, RULES } from './rules';

// Extensions of compiled or opaque artifacts that the text rules cannot read.
const OPAQUE_EXECUTABLE_EXTENSIONS = new Set([
  '.pyc', '.pyo', '.so', '.dylib', '.dll', '.exe', '.class', '.jar', '.node', '.wasm',
]);
// Source files whose text the audit rules can read.
const SCRIPT_EXTENSIONS = new Set([
  '.py', '.sh', '.bash', '.zsh', '.js', '.mjs', '.cjs', '.ts', '.rb', '.pl', '.php', '.ps1', '.bat', '.cmd',
]);
const SKIPPED_DIRECTORIES = new Set(['.git', '.skill-doctor', 'node_modules']);
const MAX_SCRIPT_BYTES = 1_000_000;

interface BundledFiles {
  opaque?: string; // first compiled or opaque artifact (relative path)
  scripts: string[]; // relative paths of readable script sources
}

function collectBundledFiles(dir: string, prefix = '', found: BundledFiles = { scripts: [] }): BundledFiles {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return found;
  }
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) collectBundledFiles(join(dir, entry.name), relativePath, found);
    } else if (entry.isFile()) {
      const extension = extname(entry.name).toLowerCase();
      if (OPAQUE_EXECUTABLE_EXTENSIONS.has(extension)) found.opaque ??= relativePath;
      else if (SCRIPT_EXTENSIONS.has(extension)) found.scripts.push(relativePath);
    }
  }
  return found;
}

function readScript(skillDir: string, relativePath: string): string | undefined {
  try {
    const path = join(skillDir, relativePath);
    return statSync(path).size > MAX_SCRIPT_BYTES ? undefined : readFileSync(path, 'utf-8');
  } catch {
    return undefined;
  }
}

export function runAudit(skills: SkillRecord[]): AuditResult {
  const findings: AuditFinding[] = [];

  for (const skill of skills) {
    const text = [skill.name, skill.description, ...skill.triggers].join(' ');
    // Only a SKILL.md owns its directory; other platforms' files share theirs.
    const skillDir = basename(skill.sourcePath) === 'SKILL.md' ? dirname(skill.sourcePath) : undefined;
    const bundled = skillDir ? collectBundledFiles(skillDir) : undefined;

    for (const rule of RULES) {
      // Manifest text first, then bundled scripts; one finding per rule per skill.
      const sources = [{ text, file: undefined as string | undefined }];
      for (const file of bundled?.scripts ?? []) sources.push({ text: '', file });

      for (const source of sources) {
        const content = source.file && skillDir ? readScript(skillDir, source.file) : source.text;
        const match = content ? rule.patterns.map((pattern) => pattern.exec(content)).find(Boolean) : undefined;
        if (!match) continue;
        const where = source.file ? ` (in ${source.file})` : '';
        findings.push({
          skillName: skill.name,
          sourcePath: skill.sourcePath,
          platform: skill.platform,
          scope: skill.scope,
          provenance: skill.provenance,
          ruleId: rule.ruleId,
          severity: rule.severity,
          matchedText: match[0].trim(),
          summary: `"${match[0].trim()}" — ${rule.label}${where}`,
        });
        break;
      }
    }

    if (bundled?.opaque) {
      findings.push({
        skillName: skill.name,
        sourcePath: skill.sourcePath,
        platform: skill.platform,
        scope: skill.scope,
        provenance: skill.provenance,
        ruleId: BUNDLED_EXECUTABLE_RULE.ruleId,
        severity: BUNDLED_EXECUTABLE_RULE.severity,
        matchedText: bundled.opaque,
        summary: `"${bundled.opaque}" — ${BUNDLED_EXECUTABLE_RULE.label}`,
      });
    }
  }

  const summary: Record<'high' | 'med' | 'low', number> = { high: 0, med: 0, low: 0 };
  for (const f of findings) {
    summary[f.severity]++;
  }

  return { scanned: skills.length, findings, summary };
}
