import type { SkillRecord } from '../types/skill';

export function renderShow(skill: SkillRecord): string {
  return [
    `SKILL: ${skill.name}`,
    `Platform: ${skill.platform}`,
    `Scope: ${skill.scope}`,
    `Source: ${skill.sourcePath}`,
    `Description: ${skill.description}`,
    'Triggers:',
    ...skill.triggers.map((trigger) => `- ${trigger}`),
  ].join('\n');
}