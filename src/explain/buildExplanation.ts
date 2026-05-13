import { tokenize } from '../conflicts/tokenize';
import { llmWhenToUse } from './llmExplain';
import type { WhenToUseCache } from './whenToUseCache';
import type { LlmExplainOptions, RelatedSkill, SkillExplanation } from '../types/explain';
import type { SkillRecord } from '../types/skill';

const RELATED_THRESHOLD = 0.25;
const MAX_RELATED = 3;

export interface BuildExplanationOptions {
  llmOptions?: LlmExplainOptions;
  whenToUseCache?: WhenToUseCache;
}

export async function buildExplanation(
  skill: SkillRecord,
  allSkills: SkillRecord[],
  options: BuildExplanationOptions = {},
): Promise<SkillExplanation> {
  const targetTokens = tokenize(buildText(skill));
  const related: RelatedSkill[] = [];

  for (const other of allSkills) {
    if (other.sourcePath === skill.sourcePath) continue;

    const otherTokens = tokenize(buildText(other));
    const sharedTokens = [...targetTokens].filter((t) => otherTokens.has(t)).sort().slice(0, 5);
    const unionSize = new Set([...targetTokens, ...otherTokens]).size;
    const similarity = unionSize === 0 ? 0 : sharedTokens.length / unionSize;

    if (similarity >= RELATED_THRESHOLD) {
      related.push({ name: other.name, similarity, sharedTokens });
    }
  }

  related.sort((a, b) => b.similarity - a.similarity);

  const base: SkillExplanation = { ...skill, relatedSkills: related.slice(0, MAX_RELATED) };

  const { llmOptions, whenToUseCache } = options;
  const cacheKey = skill.sourcePath;

  if (whenToUseCache?.has(cacheKey)) {
    base.whenToUse = whenToUseCache.get(cacheKey)!;
  } else if (llmOptions) {
    const whenToUse = await llmWhenToUse(skill, llmOptions);
    if (whenToUse) {
      base.whenToUse = whenToUse;
      whenToUseCache?.set(cacheKey, whenToUse);
    }
  }

  return base;
}

function buildText(skill: SkillRecord): string {
  return [skill.description, ...skill.triggers].join(' ');
}
