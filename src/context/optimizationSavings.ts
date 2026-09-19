import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { DEFAULT_BENEFIT_PRICE_TABLE, findBenefitPrice, findMostExpensiveBenefitPrice } from '../benefit/prices';
import type { CodexUsageRecord } from '../benefit/types';
import type { OptimizationPricingMode, OptimizationSuggestion, OptimizationTarget } from './optimizationTypes';
import { createTokenCounter } from './tokenCounter';

type TargetTokens = Partial<Record<OptimizationTarget, number>>;
const kinds = new Map<string, OptimizationTarget>([
  ['host_skills.instructions', 'skill-catalog'],
  ['memories.instructions', 'memory'],
  ['plugins.usage_instructions', 'plugins'],
  ['plugins.recommendations', 'plugins'],
]);

/** Follow only observed target text, never multiply an initial header by turn count. */
export async function responseTargetTokens(path: string, records: CodexUsageRecord[], initial: TargetTokens): Promise<Map<number, TargetTokens>> {
  const wanted = new Set(records.map((record) => record.line));
  const result = new Map<number, TargetTokens>();
  if (!wanted.size) return result;
  const counter = createTokenCounter({ preserveWhitespace: true });
  const cached = new Map<OptimizationTarget, { text: string; tokens: number }>();
  let state: TargetTokens = { ...initial };
  let line = 0;
  let previousOrdinal: number | undefined;
  let responded = false;
  const stream = createReadStream(path, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const setText = (target: OptimizationTarget, text: string) => {
    const old = cached.get(target);
    const tokens = old?.text === text ? old.tokens : counter.count(text);
    cached.set(target, { text, tokens }); state[target] = tokens;
  };
  try {
    for await (const raw of lines) {
      line++;
      if (!raw.trim()) continue;
      let item;
      try { item = JSON.parse(raw); } catch { state = {}; continue; }
      if (previousOrdinal !== undefined && item.ordinal !== previousOrdinal + 1) state = {};
      previousOrdinal = typeof item.ordinal === 'number' ? item.ordinal : undefined;
      const p = item.payload ?? {};
      if (item.type === 'compacted' || (item.type === 'event_msg' && p.type === 'item_completed' && p.item?.type === 'ContextCompaction')) state = {};
      // A replacement snapshot after a response breaks retention evidence. Only
      // explicit text observations can restore it; missing fields are not zero.
      if (item.type === 'world_state') {
        if (responded && p.full === true) state = {};
        const skills = p.state?.host_skills;
        if (skills === null) delete state['skill-catalog'];
        else if (typeof skills?.body === 'string' && skills.truncated !== true) setText('skill-catalog', skills.body);
      }
      if (item.type === 'response_item' && ['developer', 'user'].includes(p.role)) {
        const metadata = p.internal_chat_message_metadata_passthrough?.content_item_kinds;
        if (Array.isArray(metadata)) {
          if (!Array.isArray(p.content) || metadata.length !== p.content.length || metadata.some((kind, index) => kinds.has(kind) && typeof p.content[index]?.text !== 'string')) state = {};
          else {
            const texts: Partial<Record<OptimizationTarget, string>> = {};
            metadata.forEach((kind, index) => {
              const target = kinds.get(kind);
              if (!target) return;
              const text = p.content[index]?.text;
              if (typeof text !== 'string') { delete state[target]; return; }
              texts[target] = (texts[target] ?? '') + text;
            });
            for (const target of Object.keys(texts) as OptimizationTarget[]) setText(target, texts[target]!);
          }
        }
      }
      if (wanted.has(line)) {
        result.set(line, { ...state }); responded = true;
        if (result.size === wanted.size) break;
      }
    }
  } finally { lines.close(); stream.destroy(); }
  return result;
}

export function responseSavingsCost(tokens: number, record: CodexUsageRecord, mode: OptimizationPricingMode = 'actual'): OptimizationSuggestion['cost'] {
  const price = mode === 'max'
    ? findMostExpensiveBenefitPrice(DEFAULT_BENEFIT_PRICE_TABLE)
    : findBenefitPrice(record.model, DEFAULT_BENEFIT_PRICE_TABLE);
  const usage = record.usage;
  if (record.quality !== 'complete' || tokens > usage.inputTokens || !price || price.inputPerMillion === undefined || price.cachedInputPerMillion === undefined || price.inputTiers?.length || price.maxInputTokens === undefined || usage.inputTokens > price.maxInputTokens || usage.cacheWriteInputTokens !== 0) return undefined;
  const minCached = Math.max(0, tokens - (usage.inputTokens - usage.cachedInputTokens));
  const maxCached = Math.min(tokens, usage.cachedInputTokens);
  const endpoints = [minCached, maxCached].map((cached) => ((tokens - cached) * price.inputPerMillion! + cached * price.cachedInputPerMillion!) / 1_000_000);
  return { lower: Math.min(...endpoints), upper: Math.max(...endpoints), currency: price.currency };
}

export function cumulativeSavings(target: OptimizationTarget, records: CodexUsageRecord[], observations: Map<number, TargetTokens>, mode: OptimizationPricingMode = 'actual'): NonNullable<OptimizationSuggestion['cumulative']> {
  let tokens = 0; let coveredResponses = 0; let pricedResponses = 0; let lower = 0; let upper = 0;
  for (const record of records) {
    const observed = observations.get(record.line)?.[target];
    if (observed === undefined || record.quality !== 'complete' || observed > record.usage.inputTokens) continue;
    tokens += observed; coveredResponses++;
    const cost = responseSavingsCost(observed, record, mode);
    if (cost) { pricedResponses++; lower += cost.lower; upper += cost.upper; }
  }
  return { tokens: coveredResponses ? tokens : undefined, coveredResponses, pricedResponses,
    cost: pricedResponses ? { lower, upper, currency: 'USD' } : undefined };
}
