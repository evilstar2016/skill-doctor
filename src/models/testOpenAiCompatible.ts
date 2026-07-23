import type { AnalysisUserConfig, EmbeddingUserConfig } from '../config/loadUserConfig';
import type { ModelServiceKind } from '../config/modelConfig';

const DEFAULT_TIMEOUT_MS = 30_000;

export async function testOpenAiCompatibleModel(
  kind: ModelServiceKind,
  config: AnalysisUserConfig | EmbeddingUserConfig,
): Promise<{ message: string }> {
  if (!config.baseUrl || !config.model) throw new Error(`${kind} model service is not configured.`);
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/${kind === 'analysis' ? 'chat/completions' : 'embeddings'}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    signal: AbortSignal.timeout(kind === 'analysis' ? (config as AnalysisUserConfig).timeoutMs ?? DEFAULT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS),
    body: JSON.stringify(
      kind === 'analysis'
        ? { model: config.model, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 5, stream: false }
        : { model: config.model, input: 'Skill Doctor connection test.' },
    ),
  });
  if (!response.ok) throw new Error(await readResponseError(response));
  const data = await response.json() as { choices?: unknown[]; data?: unknown[] };
  if (kind === 'analysis' && !Array.isArray(data.choices)) throw new Error('The analysis service returned no choices.');
  if (kind === 'embedding' && !Array.isArray(data.data)) throw new Error('The embedding service returned no vectors.');
  return { message: kind === 'analysis' ? 'Analysis model is reachable.' : 'Embedding model is reachable.' };
}

async function readResponseError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: { message?: unknown }; message?: unknown };
    const message = body.error?.message ?? body.message;
    if (typeof message === 'string' && message.trim()) return message;
  } catch {
    // Fall through to the status text when the provider returned a non-JSON error.
  }
  return `Model service request failed (${response.status} ${response.statusText}).`;
}
