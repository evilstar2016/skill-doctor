import type { LlmExplainOptions } from '../types/explain';
import type { SkillRecord } from '../types/skill';
import type { AiFinding } from '../types/audit';
import { hashContent, readAuditCache, writeAuditCache } from './audit-cache';
import { AI_AUDIT_SYSTEM_PROMPT } from './ai-prompt';

const DEFAULT_TIMEOUT_MS = 30_000;

export interface AiAuditOptions {
  llmOptions: LlmExplainOptions;
  useCache?: boolean;
  homeDir?: string;
}

interface RawFinding {
  code?: unknown;
  severity?: unknown;
  title?: unknown;
  detail?: unknown;
  evidence?: unknown;
}

interface RawResponse {
  findings?: unknown[];
}

export async function runAiAudit(
  skills: SkillRecord[],
  options: AiAuditOptions,
): Promise<AiFinding[]> {
  if (skills.length === 0) return [];

  const useCache = options.useCache !== false;
  const cache = useCache ? readAuditCache(options.homeDir) : new Map();
  const model = options.llmOptions.modelId;
  const results: AiFinding[] = [];
  let cacheChanged = false;

  for (const skill of skills) {
    const content = buildContent(skill);
    const hash = hashContent(content);

    const cached = cache.get(hash);
    if (useCache && cached && cached.model === model) {
      results.push(...cached.findings);
      continue;
    }

    const raw = await callLlm(content, options.llmOptions);
    const findings = raw ? parseFindings(raw, skill) : [];

    cache.set(hash, { cachedAt: Date.now(), model, findings });
    cacheChanged = true;
    results.push(...findings);
  }

  if (cacheChanged && useCache) {
    writeAuditCache(cache, options.homeDir);
  }

  return results;
}

function buildContent(skill: SkillRecord): string {
  return [
    `Name: ${skill.name}`,
    `Platform: ${skill.platform}`,
    `Scope: ${skill.scope}`,
    `Description: ${skill.description}`,
    skill.triggers.length > 0 ? `Triggers: ${skill.triggers.join(', ')}` : '',
    skill.provenance ? `Source: ${skill.provenance.installSource}` : 'Source: (unknown)',
  ]
    .filter(Boolean)
    .join('\n');
}

async function callLlm(content: string, options: LlmExplainOptions): Promise<RawResponse | null> {
  const url = `${options.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.apiKey) headers['Authorization'] = `Bearer ${options.apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      body: JSON.stringify({
        model: options.modelId,
        messages: [
          { role: 'system', content: AI_AUDIT_SYSTEM_PROMPT },
          { role: 'user', content: `Audit this skill:\n\n${content}` },
        ],
        response_format: { type: 'json_object' },
        stream: false,
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return null;

    try {
      return JSON.parse(text) as RawResponse;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

function parseFindings(raw: RawResponse, skill: SkillRecord): AiFinding[] {
  if (!Array.isArray(raw.findings)) return [];

  return raw.findings.flatMap((item) => {
    const f = item as RawFinding;
    const code = typeof f.code === 'string' ? f.code : 'unknown';
    const severity = toSeverity(f.severity);
    const title = typeof f.title === 'string' ? f.title : code;
    const detail = typeof f.detail === 'string' ? f.detail : '';
    const evidence =
      typeof f.evidence === 'string' && f.evidence.trim()
        ? f.evidence.trim().slice(0, 160)
        : undefined;

    const finding: AiFinding = {
      source: 'ai',
      skillName: skill.name,
      sourcePath: skill.sourcePath,
      platform: skill.platform,
      scope: skill.scope,
      ...(skill.provenance ? { provenance: skill.provenance } : {}),
      code,
      severity,
      title,
      detail,
      ...(evidence ? { evidence } : {}),
    };

    return [finding];
  });
}

function toSeverity(value: unknown): 'high' | 'med' | 'low' {
  if (value === 'high') return 'high';
  if (value === 'med' || value === 'warn') return 'med';
  return 'low';
}
