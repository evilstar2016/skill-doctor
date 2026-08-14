import type { ConflictPair, SkillRecord } from '../types/skill';
import { getPlatformAdapter } from '../platforms/registry';

export function renderScan(skills: SkillRecord[], conflicts: ConflictPair[]): string {
  const visibleSkills = skills.filter((skill) => skill.context?.resource !== 'memory');
  const duplicateCount = conflicts.filter((pair) => pair.kind === 'duplicate').length;
  const conflictCount = conflicts.filter((pair) => pair.kind === 'conflict').length;
  const platformCounts = countByPlatform(visibleSkills);
  const platformLines = Object.entries(platformCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([platform, count]) => [
      `- ${platform}: ${count}`,
      `  display name: ${getPlatformAdapter(platform)?.displayName ?? platform}`,
    ])
    .join('\n');
  const skillLines =
    visibleSkills.length === 0
      ? ['- none']
      : visibleSkills.flatMap((skill) => [
          `- ${skill.name}`,
          `  platform: ${skill.platform}  scope: ${skill.scope}`,
          `  install source: ${skill.provenance?.installSource ?? '—'}  confidence: ${skill.provenance?.confidence ?? '—'}`,
          `  repository: ${skill.provenance?.repository ?? '—'}`,
          `  author: ${skill.provenance?.author ?? '—'}`,
        ]);

  return [
    'SKILL DOCTOR REPORT',
    `Total skills installed: ${visibleSkills.length}`,
    `Duplicates detected: ${duplicateCount}`,
    `Conflicts detected: ${conflictCount}`,
    'Platforms:',
    platformLines || '- none',
    '',
    'Skills:',
    ...skillLines,
  ].join('\n');
}

function countByPlatform(skills: SkillRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const skill of skills) {
    counts[skill.platform] = (counts[skill.platform] ?? 0) + 1;
  }

  return counts;
}
