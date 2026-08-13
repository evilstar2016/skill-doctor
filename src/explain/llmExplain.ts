import type { LlmExplainOptions } from '../types/explain';
import type { SkillRecord } from '../types/skill';
import { debugLlm } from '../llm/logging';

const warnedLlmFailures = new Set<string>();
const DEFAULT_LLM_TIMEOUT_MS = 15000;

/**
 * Shared hard constraint sent as a system message with every JSON request.
 *
 * Some OpenAI-compatible endpoints ignore `response_format: json_object` or
 * run models that only loosely follow it, so we reinforce the format in the
 * prompt as the primary line of defense. The parser-side recovery in
 * `callJsonLlm` is only a secondary safety net.
 */
const JSON_FORMAT_SYSTEM_PROMPT =
  'You are a JSON-only responder. Respond with a single, valid JSON object and nothing else.\n' +
  'Strict rules:\n' +
  '1. Do not wrap the output in markdown code fences or any markup.\n' +
  '2. Do not include explanatory text, commentary, or any characters outside the JSON object.\n' +
  '3. Do not add extra braces, nesting, or keys beyond what the request specifies.\n' +
  '4. The entire response must be parseable by a strict JSON parser (e.g. JSON.parse).';

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
    'Do not include markdown or any keys besides "whenToUse".\n' +
    'Example response: {"whenToUse":"Use it before writing code to clarify requirements and tradeoffs."}\n\n' +
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
    'Prefer exact literals from the files.\n' +
    'Example response: {"repository":"https://github.com/owner/repo","author":"Owner Name"}\n\n' +
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
    'Use the provided "key" values unchanged. Do not include markdown or any extra keys.\n' +
    'Example response: {"groups":[{"key":"single","label":"Version Control"}]}\n\n' +
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

/**
 * Recover the first syntactically balanced JSON object from a model response.
 *
 * Some OpenAI-compatible endpoints or models return JSON wrapped in prose,
 * markdown fences, or with a stray leading brace. Naively calling JSON.parse
 * on the raw content fails in those cases, so we scan for the first "{" and
 * match it to its closing "}" (respecting string literals), then attempt to
 * parse the slice. Multiple candidate start positions are tried so a stray
 * leading "{" can be skipped and the inner object recovered.
 */
function extractFirstJsonObject(input: string): string | null {
  const text = input.trim();
  if (!text) {
    return null;
  }

  const starts: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      starts.push(i);
    }
  }
  if (starts.length === 0) {
    return null;
  }

  for (const start of starts) {
    const end = findMatchingBrace(text, start);
    if (end === -1) {
      continue;
    }
    const candidate = text.slice(start, end + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // try the next candidate start position
    }
  }

  return null;
}

function findMatchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

export async function callJsonLlm<T>(prompt: string, options: LlmExplainOptions): Promise<T | null> {
  const url = `${options.baseUrl.replace(/\/$/, '')}/chat/completions`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.apiKey) {
    headers['Authorization'] = `Bearer ${options.apiKey}`;
  }

  const requestBody = {
    model: options.modelId,
    messages: [
      { role: 'system', content: JSON_FORMAT_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    response_format: {
      type: 'json_object',
    },
    stream: false,
  };

  debugLlm(
    `request -> ${url}`,
    [
      `model: ${options.modelId}`,
      `headers: ${JSON.stringify({ ...headers, Authorization: headers.Authorization ? '<redacted>' : undefined })}`,
      `body:\n${JSON.stringify(requestBody, null, 2)}`,
    ].join('\n'),
  );

  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS),
      body: JSON.stringify(requestBody),
    });

    const elapsedMs = Date.now() - startedAt;
    debugLlm(`response <- ${url} (HTTP ${response.status}, ${elapsedMs}ms)`, '');

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

    debugLlm('raw model content', content);

    try {
      const jsonText = extractFirstJsonObject(content);
      if (!jsonText) {
        throw new SyntaxError('no JSON object found in response');
      }
      if (jsonText !== content) {
        debugLlm('recovered JSON (differs from raw content)', jsonText);
      }
      return JSON.parse(jsonText) as T;
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
