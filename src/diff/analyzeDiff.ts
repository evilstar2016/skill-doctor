import { callJsonLlm } from '../explain/llmExplain';
import type { LlmExplainOptions } from '../types/explain';
import type { DiffAnalysis, SkillProfile } from './types';

export async function analyzeDiff(
  a: SkillProfile,
  b: SkillProfile,
  options: LlmExplainOptions,
): Promise<DiffAnalysis | null> {
  const prompt = `You are a skill comparison expert. Compare these two AI assistant skills and return a JSON object.

Skill A: "${a.name}"
${a.rawContent}

---

Skill B: "${b.name}"
${b.rawContent}

Return ONLY a JSON object with this exact shape:
{
  "prosConsA": { "pros": ["..."], "cons": ["..."] },
  "prosConsB": { "pros": ["..."], "cons": ["..."] },
  "triggerComparison": "one paragraph describing how their trigger conditions differ",
  "coverageOverlap": ["scenario both cover", ...],
  "coverageOnlyA": ["scenario only A covers", ...],
  "coverageOnlyB": ["scenario only B covers", ...],
  "situationalAdvice": [
    { "condition": "If you are a beginner", "recommendation": "A", "reason": "..." },
    ...
  ]
}

Rules:
- Be concise (1-2 sentences per item)
- "recommendation" must be exactly "A", "B", or "either"
- Return 3-5 items for situationalAdvice covering different user types and scenarios
- All text in the same language as the skill content`;

  return callJsonLlm<DiffAnalysis>(prompt, options);
}
