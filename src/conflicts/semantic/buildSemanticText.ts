import type { SkillRecord } from '../../types/skill';

export function buildSemanticText(skill: SkillRecord): string {
  return [skill.name, skill.description, ...skill.triggers]
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n');
}
