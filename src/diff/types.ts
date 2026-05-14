export interface SkillProfile {
  name: string;
  description: string;
  whenToUse: string;
  triggers: string[];
  checklistItems: string[];
  rawContent: string;
}

export interface SituationalAdvice {
  condition: string;
  recommendation: 'A' | 'B' | 'either';
  reason: string;
}

export interface DiffAnalysis {
  prosConsA: { pros: string[]; cons: string[] };
  prosConsB: { pros: string[]; cons: string[] };
  triggerComparison: string;
  coverageOverlap: string[];
  coverageOnlyA: string[];
  coverageOnlyB: string[];
  situationalAdvice: SituationalAdvice[];
}

export interface DiffResult {
  skillA: SkillProfile;
  skillB: SkillProfile;
  analysis: DiffAnalysis | null;
}
