import type { ConflictDetectionOptions, ConflictPair, SkillRecord } from '../types/skill';
import { detectEmbeddingConflicts } from './semantic/detectEmbeddingConflicts';
import { detectTokenConflicts } from './token/detectTokenConflicts';

export async function detectConflicts(
  skills: SkillRecord[],
  options: ConflictDetectionOptions = {},
): Promise<ConflictPair[]> {
  const strategy = options.strategy ?? 'token';

  switch (strategy) {
    case 'token':
      return detectTokenConflicts(skills);
    case 'embedding':
      return detectEmbeddingConflicts(skills, options);
  }
}
