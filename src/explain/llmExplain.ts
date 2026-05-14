import type { LlmExplainOptions } from '../types/explain';
import type { SkillRecord } from '../types/skill';

const warnedLlmFailures = new Set<string>();
const LLM_REQUEST_TIMEOUT_MS = 15000;

interface GroupLabelRequest {
  key: string;
  tokenLabel: string;
  skills: SkillRecord[];
}

interface ProvenanceRequest {
  skillName: string;
  sourcePath: string;
  frontmatter: {
    author?: string;
    repository?: string;
  };
  metadataFiles: Record<string, string>;
  content: string;
}

/**
 * Ask the LLM to generate a 1-2 sentence "when to use" explanation for a skill.
 * Returns null on any error so callers can fall back to token-based output.
 */
export async function llmWhenToUse(
  skill: SkillRecord,
  options: LlmExplainOptions,
): Promise<string | null> {
  const triggers = skill.triggers.length > 0 ? skill.triggers : [];
  const prompt =
    'You are a developer tool assistant. ' +
    'Return strict JSON with exactly one key: "whenToUse". ' +
    'The value must be a concise 1-2 sentence explanation aimed at developers. ' +
    'Do not include markdown or any keys besides "whenToUse".\n\n' +
    `Skill payload:\n${JSON.stringify({
      name: skill.name,
      description: skill.description,
      triggers,
    }, null, 2)}`;

  const result = await callJsonLlm<{ whenToUse?: string }>(prompt, options);
  return normalizeTextField(result?.whenToUse);
}

/**
 * Ask the LLM to infer repository/author provenance when local git and metadata are missing.
 * Returns null on any error so callers can keep the fields empty.
 */
export async function llmExtractProvenance(
  request: ProvenanceRequest,
  options: LlmExplainOptions,
): Promise<{ repository?: string; author?: string } | null> {
  const prompt =
    'You are extracting provenance metadata for a developer skill. ' +
    'Return strict JSON with exactly two keys: "repository" and "author". ' +
    'Use strings when the value is explicitly supported by the provided evidence. ' +
    'Use empty string when the value is unknown. ' +
    'Do not invent repository URLs, owners, or author names. ' +
    'Prefer exact literals from the files.\n\n' +
    `Provenance payload:\n${JSON.stringify(request, null, 2)}`;

  const result = await callJsonLlm<{ repository?: string; author?: string }>(prompt, options);
  if (!result) {
    return null;
  }

  const repository = normalizeTextField(result.repository) ?? undefined;
  const author = normalizeTextField(result.author) ?? undefined;
  return repository || author ? { ...(repository ? { repository } : {}), ...(author ? { author } : {}) } : null;
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
  const labels = await llmGroupLabels(
    [{ key: 'single', tokenLabel, skills }],
    options,
  );
  return labels.get('single') ?? tokenLabel;
}

export async function llmGroupLabels(
  requests: GroupLabelRequest[],
  options: LlmExplainOptions,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  if (requests.length === 0) {
    return results;
  }

  const prompt =
    'You are categorizing developer workflow AI skills into semantic groups. ' +
    'Return strict JSON with exactly one key: "groups". ' +
    '"groups" must be an array of objects with keys "key" and "label". ' +
    'Each "label" must be a short 2-4 word label like "Version Control" or "Code Review". ' +
    'Use the provided "key" values unchanged. Do not include markdown or any extra keys.\n\n' +
    `Group payload:\n${JSON.stringify(
      requests.map((request) => ({
        key: request.key,
        tokenLabel: request.tokenLabel,
        skills: request.skills.slice(0, 8).map((skill) => ({
          name: skill.name,
          description: skill.description,
        })),
      })),
      null,
      2,
    )}`;

  const response = await callJsonLlm<{ groups?: { key?: string; label?: string }[] }>(prompt, options);
  for (const item of response?.groups ?? []) {
    const key = normalizeTextField(item?.key);
    const label = normalizeTextField(item?.label);
    if (key && label) {
      results.set(key, label);
    }
  }

  return results;
}

export async function callJsonLlm<T>(prompt: string, options: LlmExplainOptions): Promise<T | null> {
  const url = `${options.baseUrl.replace(/\/$/, '')}/chat/completions`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.apiKey) {
    headers['Authorization'] = `Bearer ${options.apiKey}`;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(LLM_REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        model: options.modelId,
        messages: [{ role: 'user', content: prompt }],
        response_format: {
          type: 'json_object',
        },
        stream: false,
      }),
    });

    if (!response.ok) {
      warnLlmFailure(await readFailureMessage(response));
      return null;
    }

    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      warnLlmFailure('response did not include choices[0].message.content');
      return null;
    }

    try {
      return JSON.parse(content) as T;
    } catch {
      warnLlmFailure(`response was not valid JSON: ${content.slice(0, 240)}`);
      return null;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnLlmFailure(message);
    return null;
  }
}

function normalizeTextField(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

async function readFailureMessage(response: Response): Promise<string> {
  let detail = '';

  try {
    const body = await response.text();
    const normalized = body.replace(/\s+/g, ' ').trim();
    detail = normalized.slice(0, 240);
  } catch {
    // ignore body parse failures and keep the status-only message
  }

  return detail ? `HTTP ${response.status}: ${detail}` : `HTTP ${response.status}`;
}

function warnLlmFailure(message: string): void {
  if (warnedLlmFailures.has(message)) {
    return;
  }

  warnedLlmFailures.add(message);
  process.stderr.write(`skill-doctor: LLM request failed, falling back to non-LLM output. ${message}\n`);
}
