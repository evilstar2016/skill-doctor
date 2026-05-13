import type { LlmExplainOptions } from '../types/explain';
import type { SkillRecord } from '../types/skill';

/**
 * Ask the LLM to generate a 1-2 sentence "when to use" explanation for a skill.
 * Returns null on any error so callers can fall back to token-based output.
 */
export async function llmWhenToUse(
  skill: SkillRecord,
  options: LlmExplainOptions,
): Promise<string | null> {
  const triggersText = skill.triggers.length > 0 ? skill.triggers.join(', ') : 'none';
  const prompt =
    `You are a developer tool assistant. Given an AI agent skill's name, description, and triggers, ` +
    `write a concise 1-2 sentence "When to use" explanation aimed at developers.\n\n` +
    `Skill: ${skill.name}\n` +
    `Description: ${skill.description}\n` +
    `Triggers: ${triggersText}\n\n` +
    `Respond with only the explanation text. No JSON, no markdown, no prefix like "Use this when:".`;

  return callLlm(prompt, options);
}

/**
 * Ask the LLM to generate a short 2-4 word group label for a set of skills.
 * Falls back to the token-based label on any error.
 */
export async function llmGroupLabel(
  skills: SkillRecord[],
  tokenLabel: string,
  options: LlmExplainOptions,
): Promise<string> {
  const skillSummaries = skills
    .slice(0, 8) // cap context length
    .map((s) => `- ${s.name}: ${s.description}`)
    .join('\n');

  const prompt =
    `You are categorizing developer workflow AI skills into a group. ` +
    `Write a short 2-4 word group label (like "Version Control", "Code Review", "Documentation").\n\n` +
    `Skills in this group:\n${skillSummaries}\n\n` +
    `Respond with only the label text. No JSON, no markdown, no period.`;

  const result = await callLlm(prompt, options);
  return result ?? tokenLabel;
}

async function callLlm(prompt: string, options: LlmExplainOptions): Promise<string | null> {
  const url = `${options.baseUrl.replace(/\/$/, '')}/chat/completions`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.apiKey) {
    headers['Authorization'] = `Bearer ${options.apiKey}`;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: options.modelId,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data?.choices?.[0]?.message?.content?.trim();
    return content ?? null;
  } catch {
    return null;
  }
}
