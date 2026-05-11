import type { ConflictPair, Severity, SkillRecord } from '../types/skill';
import { tokenize } from './tokenize';

const LOW_THRESHOLD = 0.25;
const MED_THRESHOLD = 0.4;
const HIGH_THRESHOLD = 0.65;

export function detectConflicts(skills: SkillRecord[]): ConflictPair[] {
  if (skills.length < 2) {
    return [];
  }

  const pairs: ConflictPair[] = [];

  for (let leftIndex = 0; leftIndex < skills.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < skills.length; rightIndex += 1) {
      const left = skills[leftIndex];
      const right = skills[rightIndex];

      if (isDuplicatePair(left, right)) {
        pairs.push({
          a: left,
          b: right,
          kind: 'duplicate',
          similarity: 1,
          sharedTokens: [],
          severity: 'high',
        });
        continue;
      }

      const leftTokens = tokenize(buildConflictText(left));
      const rightTokens = tokenize(buildConflictText(right));
      const sharedTokens = [...leftTokens].filter((token) => rightTokens.has(token)).sort().slice(0, 10);
      const unionSize = new Set([...leftTokens, ...rightTokens]).size;
      const similarity = unionSize === 0 ? 0 : sharedTokens.length / unionSize;

      if (similarity < LOW_THRESHOLD) {
        continue;
      }

      pairs.push({
        a: left,
        b: right,
        kind: 'conflict',
        similarity,
        sharedTokens,
        severity: getSeverity(similarity),
      });
    }
  }

  return pairs;
}

function buildConflictText(skill: SkillRecord): string {
  return [skill.description, ...skill.triggers].join(' ');
}

function getSeverity(similarity: number): Severity {
  if (similarity >= HIGH_THRESHOLD) {
    return 'high';
  }

  if (similarity >= MED_THRESHOLD) {
    return 'med';
  }

  return 'low';
}

function isDuplicatePair(left: SkillRecord, right: SkillRecord): boolean {
  return normalizeName(left.name) === normalizeName(right.name) && left.sourcePath !== right.sourcePath;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}