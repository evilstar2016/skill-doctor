import type { SkillRecord } from './skill';

export interface LlmExplainOptions {
  baseUrl: string;
  modelId: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface RelatedSkill {
  name: string;
  similarity: number;
  sharedTokens: string[];
}

export interface SkillExplanation extends SkillRecord {
  relatedSkills: RelatedSkill[];
  whenToUse?: string;
}

export interface SkillGroup {
  label: string;
  skills: SkillRecord[];
}

export interface GroupResult {
  groups: SkillGroup[];
  ungrouped: SkillRecord[];
}
