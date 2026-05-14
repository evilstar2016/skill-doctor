import type { SkillRecord } from '../../types/skill';

export function buildAnalysisPrompt(a: SkillRecord, b: SkillRecord): string {
  return `You are analyzing two AI agent skills to determine if they conflict with each other.

Skill A: ${a.name}
Description: ${a.description}
Triggers: ${a.triggers.join(', ') || 'none'}

Skill B: ${b.name}
Description: ${b.description}
Triggers: ${b.triggers.join(', ') || 'none'}

Analyze these two skills and respond with ONLY a JSON object in this exact format:
{
  "summary": "one sentence describing the nature and degree of overlap",
  "overlapAreas": ["area where they overlap", "..."],
  "boundaries": ["where skill A ends and B begins", "..."],
  "strengthsA": ["what skill A does better or uniquely", "..."],
  "strengthsB": ["what skill B does better or uniquely", "..."],
  "verdict": "conflicting",
  "remediation": "one concrete action to reduce overlap or clarify boundaries"
}

The verdict must be one of:
- "conflicting": they overlap significantly and would confuse an agent choosing between them
- "adjacent": they are related but serve clearly different purposes
- "distinct": they are unrelated despite surface similarity

The remediation must be a single actionable sentence focused on renaming triggers, narrowing scope, merging skills, or removing one skill.

Respond with only the JSON object, no explanation.`;
}
