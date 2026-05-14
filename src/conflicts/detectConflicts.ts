import type { ConflictDetectionOptions, ConflictPair, SkillRecord } from '../types/skill';
import { generateRemediation } from './generateRemediation';
import { detectEmbeddingConflicts } from './semantic/detectEmbeddingConflicts';
import { detectTokenConflicts } from './token/detectTokenConflicts';

export async function detectConflicts(
  skills: SkillRecord[],
  options: ConflictDetectionOptions = {},
): Promise<ConflictPair[]> {
  const strategy = options.strategy ?? 'token';

  let pairs: ConflictPair[];
  switch (strategy) {
    case 'token':
      pairs = detectTokenConflicts(skills);
      break;
    case 'embedding':
      pairs = await detectEmbeddingConflicts(skills, options);
      break;
  }

  for (const pair of pairs) {
    pair.remediation = generateRemediation(pair);
  }

  return pairs;
}
