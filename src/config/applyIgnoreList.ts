import type { AuditFinding } from '../types/audit';
import type { ConflictPair } from '../types/skill';
import type { IgnoreUserConfig } from './loadUserConfig';

export function filterConflicts(pairs: ConflictPair[], ignore: IgnoreUserConfig): ConflictPair[] {
  const { skillNames = [], conflictPairs = [] } = ignore;
  if (skillNames.length === 0 && conflictPairs.length === 0) return pairs;

  const ignoredNames = new Set(skillNames);
  const ignoredPairs = new Set(
    conflictPairs.map(([a, b]) => [a, b].sort().join('\0')),
  );

  return pairs.filter((pair) => {
    if (ignoredNames.has(pair.a.name) || ignoredNames.has(pair.b.name)) return false;
    if (ignoredPairs.has([pair.a.name, pair.b.name].sort().join('\0'))) return false;
    return true;
  });
}

export function filterFindings(findings: AuditFinding[], ignore: IgnoreUserConfig): AuditFinding[] {
  const { skillNames = [] } = ignore;
  if (skillNames.length === 0) return findings;

  const ignoredNames = new Set(skillNames);
  return findings.filter((f) => !ignoredNames.has(f.skillName));
}
