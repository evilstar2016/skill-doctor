import type { ConflictPair } from '../types/skill';

export function generateRemediation(pair: ConflictPair): string {
  const llmRemediation = pair.analysis?.remediation?.trim();
  if (llmRemediation) {
    return llmRemediation;
  }

  if (pair.kind === 'duplicate') {
    return `Remove the duplicate — keep one copy and delete the other.`;
  }

  if (pair.a.platform === pair.b.platform && pair.a.scope !== pair.b.scope) {
    return 'Move one skill to a different scope (project vs global) or merge them.';
  }

  if (pair.a.platform !== pair.b.platform && hasSharedTriggers(pair)) {
    return 'Add platform-specific trigger prefixes to disambiguate.';
  }

  if (pair.analysis?.verdict === 'adjacent') {
    return "Narrow each skill's trigger list to reduce overlap — they handle adjacent concerns.";
  }

  if (pair.analysis?.verdict === 'conflicting') {
    return 'Merge these skills into one, or delete the less specific one.';
  }

  return "Refine trigger keywords so they don't overlap. Consider narrowing each skill's description.";
}

function hasSharedTriggers(pair: ConflictPair): boolean {
  const triggersA = new Set(pair.a.triggers);
  return pair.b.triggers.some((t) => triggersA.has(t));
}
