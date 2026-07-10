import { Tiktoken, getEncodingNameForModel } from 'js-tiktoken/lite';
import cl100kBase from 'js-tiktoken/ranks/cl100k_base';
import gpt2 from 'js-tiktoken/ranks/gpt2';
import o200kBase from 'js-tiktoken/ranks/o200k_base';
import p50kBase from 'js-tiktoken/ranks/p50k_base';
import p50kEdit from 'js-tiktoken/ranks/p50k_edit';
import r50kBase from 'js-tiktoken/ranks/r50k_base';
import type { TiktokenBPE } from 'js-tiktoken';

import type { ContextTokenizerMode, ContextTokenizerSummary } from '../types/context';

export const DEFAULT_OPENAI_TOKENIZER_MODEL = 'gpt-4o';
type SupportedEncoding = 'gpt2' | 'r50k_base' | 'p50k_base' | 'p50k_edit' | 'cl100k_base' | 'o200k_base';

const OPENAI_FALLBACK_ENCODING: SupportedEncoding = 'o200k_base';
const ENCODING_RANKS: Record<SupportedEncoding, TiktokenBPE> = {
  gpt2,
  r50k_base: r50kBase,
  p50k_base: p50kBase,
  p50k_edit: p50kEdit,
  cl100k_base: cl100kBase,
  o200k_base: o200kBase,
};
const encoderCache = new Map<SupportedEncoding, Tiktoken>();

export interface TokenCounterOptions {
  tokenizer?: ContextTokenizerMode;
  tokenizerModel?: string;
}

export interface TokenCounter {
  readonly summary: ContextTokenizerSummary;
  count(text: string): number;
}

export function createTokenCounter(options: TokenCounterOptions = {}): TokenCounter {
  const mode = options.tokenizer ?? 'openai';

  if (mode === 'approx') {
    return {
      summary: { mode },
      count: estimateApproxTokens,
    };
  }

  const model = options.tokenizerModel ?? DEFAULT_OPENAI_TOKENIZER_MODEL;
  const resolved = resolveOpenAiEncoding(model);

  return {
    summary: {
      mode,
      model,
      encoding: resolved.encoding,
      ...(resolved.fallback ? { fallback: true } : {}),
    },
    count(text: string): number {
      const normalized = normalizeForTokenEstimate(text);
      if (!normalized) return 0;
      return Math.max(1, resolved.encoder.encode(normalized, [], []).length);
    },
  };
}

export function estimateTokens(text: string): number {
  return createTokenCounter().count(text);
}

export function estimateApproxTokens(text: string): number {
  const normalized = normalizeForTokenEstimate(text);
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

export function normalizeForTokenEstimate(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function resolveOpenAiEncoding(model: string): { encoder: Tiktoken; encoding: SupportedEncoding; fallback: boolean } {
  const encoding = getEncodingNameForOpenAiModel(model);
  const resolvedEncoding = encoding ?? OPENAI_FALLBACK_ENCODING;

  return {
    encoder: getCachedEncoder(resolvedEncoding),
    encoding: resolvedEncoding,
    fallback: encoding === null,
  };
}

function getCachedEncoder(encoding: SupportedEncoding): Tiktoken {
  const cached = encoderCache.get(encoding);
  if (cached) return cached;

  const encoder = new Tiktoken(ENCODING_RANKS[encoding]);
  encoderCache.set(encoding, encoder);
  return encoder;
}

function getEncodingNameForOpenAiModel(model: string): SupportedEncoding | null {
  const normalizedModel = model.trim().toLowerCase();

  try {
    return getEncodingNameForModel(normalizedModel as Parameters<typeof getEncodingNameForModel>[0]);
  } catch {
    return null;
  }
}
