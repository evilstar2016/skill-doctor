import type { ConflictAnalysis, SkillRecord } from '../../types/skill';
import { buildAnalysisPrompt } from './buildAnalysisPrompt';

export interface AnalysisClientOptions {
  baseUrl: string;
  modelId: string;
  apiKey?: string;
}

export async function analyzeConflict(
  a: SkillRecord,
  b: SkillRecord,
  options: AnalysisClientOptions,
): Promise<ConflictAnalysis> {
  const prompt = buildAnalysisPrompt(a, b);
  const url = `${options.baseUrl.replace(/\/$/, '')}/chat/completions`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.apiKey) {
    headers['Authorization'] = `Bearer ${options.apiKey}`;
  }

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
    throw new Error(`Analysis API error ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Analysis API returned empty content');
  }

  return parseAnalysis(content);
}

function parseAnalysis(content: string): ConflictAnalysis {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Analysis response did not contain JSON: ${content.slice(0, 200)}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as Partial<ConflictAnalysis>;

  const remediation = String(parsed.remediation ?? '').trim();

  return {
    summary: String(parsed.summary ?? ''),
    overlapAreas: toStringArray(parsed.overlapAreas),
    boundaries: toStringArray(parsed.boundaries),
    strengthsA: toStringArray(parsed.strengthsA),
    strengthsB: toStringArray(parsed.strengthsB),
    verdict: toVerdict(parsed.verdict),
    ...(remediation ? { remediation } : {}),
  };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(String);
}

function toVerdict(value: unknown): ConflictAnalysis['verdict'] {
  if (value === 'conflicting' || value === 'adjacent' || value === 'distinct') {
    return value;
  }
  return 'conflicting';
}
