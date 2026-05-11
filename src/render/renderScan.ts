import type { ConflictPair, SkillRecord } from '../types/skill';

export function renderScan(skills: SkillRecord[], conflicts: ConflictPair[]): string {
  const duplicateCount = conflicts.filter((pair) => pair.kind === 'duplicate').length;
  const conflictCount = conflicts.filter((pair) => pair.kind === 'conflict').length;
  const platformCounts = countByPlatform(skills);
  const platformLines = Object.entries(platformCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([platform, count]) => `- ${platform}: ${count}`)
    .join('\n');

  return [
    'SKILL DOCTOR REPORT',
    `Total skills installed: ${skills.length}`,
    `Duplicates detected: ${duplicateCount}`,
    `Conflicts detected: ${conflictCount}`,
    'Platforms:',
    platformLines || '- none',
  ].join('\n');
}

function countByPlatform(skills: SkillRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const skill of skills) {
    counts[skill.platform] = (counts[skill.platform] ?? 0) + 1;
  }

  return counts;
}