import type { SkillExplanation } from '../types/explain';

export function renderShow(skill: SkillExplanation): string {
  const lines: string[] = [
    `SKILL: ${skill.name}`,
    `Platform: ${skill.platform}  |  Scope: ${skill.scope}`,
    `Source: ${skill.sourcePath}`,
    '',
    'DESCRIPTION',
    `  ${normalizeDescription(skill.description)}`,
    '',
    'WHEN TO USE',
  ];

  if (skill.triggers.length > 0) {
    for (const trigger of skill.triggers) {
      lines.push(`  → ${trigger}`);
    }
  } else {
    lines.push('  (no trigger conditions defined)');
  }

  if (skill.relatedSkills.length > 0) {
    lines.push('', 'RELATED SKILLS');
    for (const related of skill.relatedSkills) {
      const tokens = related.sharedTokens.slice(0, 3).join(', ');
      lines.push(
        `  ${related.name.padEnd(24)} similarity: ${related.similarity.toFixed(2)}  shared: ${tokens}`,
      );
    }
  }

  return lines.join('\n');
}

function normalizeDescription(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return '(no description)';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1) + (trimmed.endsWith('.') ? '' : '.');
}
