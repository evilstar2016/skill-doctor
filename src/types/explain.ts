import type { SkillRecord } from './skill';

export interface RelatedSkill {
  name: string;
  similarity: number;
  sharedTokens: string[];
}

export interface SkillExplanation extends SkillRecord {
  relatedSkills: RelatedSkill[];
}

export interface SkillGroup {
  label: string;
  skills: SkillRecord[];
}

export interface GroupResult {
  groups: SkillGroup[];
  ungrouped: SkillRecord[];
}
