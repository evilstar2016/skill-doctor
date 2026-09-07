import { readFile } from 'node:fs/promises';

import type { BenefitCostMetrics, BenefitPrice, BenefitPriceTable } from './types';

export const DEFAULT_BENEFIT_PRICE_TABLE: BenefitPriceTable = {
  schemaVersion: 1,
  name: 'OpenAI standard long-context API estimate',
  updatedAt: '2026-09-07',
  channel: 'api-equivalent',
  serviceTier: 'standard',
  unit: 'USD per 1M tokens',
  prices: [
    { model: 'gpt-6-astra', provider: 'openai', currency: 'USD', inputPerMillion: 20, cachedInputPerMillion: 2, cacheWriteInputPerMillion: 25, outputPerMillion: 75, maxInputTokens: 200_000, effectiveFrom: '2026-09-07', source: 'https://developers.openai.com/api/docs/pricing', notes: 'Single-tier estimate guarded at 200k input tokens; ChatGPT/Codex subscription usage is not an API bill.' },
    { model: 'gpt-5.6-sol', provider: 'openai', currency: 'USD', inputPerMillion: 8, cachedInputPerMillion: 0.8, cacheWriteInputPerMillion: 10, outputPerMillion: 30, maxInputTokens: 200_000, effectiveFrom: '2026-09-07', source: 'https://developers.openai.com/api/docs/pricing', notes: 'Single-tier estimate guarded at 200k input tokens; ChatGPT/Codex subscription usage is not an API bill.' },
    { model: 'gpt-5.6-terra', provider: 'openai', currency: 'USD', inputPerMillion: 4, cachedInputPerMillion: 0.4, cacheWriteInputPerMillion: 5, outputPerMillion: 18, maxInputTokens: 200_000, effectiveFrom: '2026-09-07', source: 'https://developers.openai.com/api/docs/pricing', notes: 'Single-tier estimate guarded at 200k input tokens; ChatGPT/Codex subscription usage is not an API bill.' },
    { model: 'gpt-5.6-luna', provider: 'openai', currency: 'USD', inputPerMillion: 0.4, cachedInputPerMillion: 0.04, cacheWriteInputPerMillion: 0.5, outputPerMillion: 1.8, maxInputTokens: 200_000, effectiveFrom: '2026-09-07', source: 'https://developers.openai.com/api/docs/pricing', notes: 'Single-tier estimate guarded at 200k input tokens; ChatGPT/Codex subscription usage is not an API bill.' },
    { model: 'gpt-5.3-codex', provider: 'openai', currency: 'USD', inputPerMillion: 1.75, cachedInputPerMillion: 0.175, outputPerMillion: 14, maxInputTokens: 200_000, effectiveFrom: '2026-09-07', source: 'https://developers.openai.com/api/docs/pricing', notes: 'Single-tier estimate guarded at 200k input tokens; cache-write price is not published in the specialized table.' },
  ],
};

function validPrice(value: unknown): value is BenefitPrice {
  if (!value || typeof value !== 'object') return false;
  const price = value as Record<string, unknown>;
  const validNumber = (candidate: unknown): boolean => candidate === undefined || (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0);
  const validTiers = price.inputTiers === undefined || (
    Array.isArray(price.inputTiers)
    && price.inputTiers.every((tier) => {
      if (!tier || typeof tier !== 'object' || Array.isArray(tier)) return false;
      const item = tier as Record<string, unknown>;
      return validNumber(item.upToInputTokens)
        && validNumber(item.inputPerMillion)
        && validNumber(item.cachedInputPerMillion)
        && validNumber(item.cacheWriteInputPerMillion);
    })
  );
  return typeof price.model === 'string'
    && typeof price.provider === 'string'
    && typeof price.currency === 'string'
    && ['inputPerMillion', 'cachedInputPerMillion', 'cacheWriteInputPerMillion', 'outputPerMillion', 'maxInputTokens']
      .every((key) => validNumber(price[key]))
    && validTiers;
}

export async function loadBenefitPriceTable(path?: string): Promise<BenefitPriceTable> {
  if (!path) return DEFAULT_BENEFIT_PRICE_TABLE;
  const value = JSON.parse(await readFile(path, 'utf8')) as unknown;
  if (!value || typeof value !== 'object') throw new Error('Price table must be a JSON object');
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || !Array.isArray(record.prices) || !record.prices.every(validPrice)) {
    throw new Error('Price table must use schemaVersion 1 and contain valid prices');
  }
  return {
    schemaVersion: 1,
    name: typeof record.name === 'string' ? record.name : 'Custom price table',
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString().slice(0, 10),
    channel: typeof record.channel === 'string' ? record.channel : 'custom',
    serviceTier: typeof record.serviceTier === 'string' ? record.serviceTier : 'custom',
    unit: typeof record.unit === 'string' ? record.unit : 'currency per 1M tokens',
    prices: record.prices,
  };
}

export function findBenefitPrice(model: string | undefined, table: BenefitPriceTable): BenefitPrice | undefined {
  if (!model) return undefined;
  const normalized = model.trim().toLowerCase();
  return table.prices.find((price) => price.model.toLowerCase() === normalized);
}

function amount(tokens: number, pricePerMillion: number | undefined): number | undefined {
  return pricePerMillion === undefined ? undefined : tokens * pricePerMillion / 1_000_000;
}

interface InputCost {
  ordinary: number;
  cached: number;
  writes: number;
}

function calculateInputCost(
  input: InputCost,
  price: BenefitPrice,
): { amount?: number; reason?: string } {
  const total = input.ordinary + input.cached + input.writes;
  if (!price.inputTiers?.length && price.maxInputTokens === undefined) {
    return { reason: 'Price table does not declare a long-context tier or an explicit maximum input range' };
  }
  if (price.maxInputTokens !== undefined && total > price.maxInputTokens) {
    return { reason: `Input usage exceeds the price table guardrail of ${price.maxInputTokens} tokens` };
  }
  const tiers = price.inputTiers?.length ? price.inputTiers : [{
    inputPerMillion: price.inputPerMillion,
    cachedInputPerMillion: price.cachedInputPerMillion,
    cacheWriteInputPerMillion: price.cacheWriteInputPerMillion,
  }];
  let previousLimit = 0;
  let remaining = total;
  let ordinaryCost = 0;
  let cachedCost = 0;
  let writeCost = 0;
  let ordinaryRemaining = input.ordinary;
  let cachedRemaining = input.cached;
  let writesRemaining = input.writes;
  for (const tier of tiers) {
    if (remaining <= 0) break;
    const upperLimit = tier.upToInputTokens ?? Number.POSITIVE_INFINITY;
    if (upperLimit <= previousLimit) return { reason: 'Price table input tiers are not strictly increasing' };
    const tierTokens = Math.min(remaining, upperLimit - previousLimit);
    if (tierTokens <= 0) continue;
    const ordinaryTokens = total > 0 ? tierTokens * input.ordinary / total : 0;
    const cachedTokens = total > 0 ? tierTokens * input.cached / total : 0;
    const writeTokens = tierTokens - ordinaryTokens - cachedTokens;
    const ordinaryPrice = tier.inputPerMillion ?? price.inputPerMillion;
    const cachedPrice = tier.cachedInputPerMillion ?? price.cachedInputPerMillion;
    const writePrice = tier.cacheWriteInputPerMillion ?? price.cacheWriteInputPerMillion;
    const ordinaryTierCost = amount(ordinaryTokens, ordinaryPrice);
    const cachedTierCost = amount(cachedTokens, cachedPrice);
    const writeTierCost = amount(writeTokens, writePrice);
    if (ordinaryTierCost === undefined || cachedTierCost === undefined || writeTierCost === undefined) {
      return { reason: 'Price table does not define all input prices for the applicable long-context tier' };
    }
    ordinaryCost += ordinaryTierCost;
    cachedCost += cachedTierCost;
    writeCost += writeTierCost;
    remaining -= tierTokens;
    previousLimit = upperLimit;
    ordinaryRemaining -= ordinaryTokens;
    cachedRemaining -= cachedTokens;
    writesRemaining -= writeTokens;
  }
  if (remaining > 1e-6 || ordinaryRemaining < -1e-6 || cachedRemaining < -1e-6 || writesRemaining < -1e-6) {
    return { reason: 'Price table has no applicable tier for the complete input usage' };
  }
  return { amount: ordinaryCost + cachedCost + writeCost };
}

export function calculateBenefitCost(
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    cacheWriteInputTokens: number;
    outputTokens: number;
  },
  price: BenefitPrice | undefined,
): BenefitCostMetrics {
  if (!price) return { status: 'unknown' };
  const usageValues = [usage.inputTokens, usage.cachedInputTokens, usage.cacheWriteInputTokens, usage.outputTokens];
  if (usageValues.some((value) => !Number.isFinite(value) || value < 0)) {
    return { status: 'unknown', priceModel: price.model };
  }
  const ordinaryInputTokens = usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteInputTokens;
  if (ordinaryInputTokens < 0 || !Number.isFinite(ordinaryInputTokens)) return { status: 'unknown', priceModel: price.model };
  const inputCost = calculateInputCost({ ordinary: ordinaryInputTokens, cached: usage.cachedInputTokens, writes: usage.cacheWriteInputTokens }, price);
  const output = amount(usage.outputTokens, price.outputPerMillion);
  if (inputCost.amount === undefined || output === undefined) {
    return {
      status: 'unknown',
      priceModel: price.model,
      ...(inputCost.reason ? { reason: inputCost.reason } : {}),
      ordinaryInputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      cacheWriteInputTokens: usage.cacheWriteInputTokens,
      outputTokens: usage.outputTokens,
    };
  }
  return {
    currency: price.currency,
    amount: inputCost.amount + output,
    status: 'estimated',
    ordinaryInputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    cacheWriteInputTokens: usage.cacheWriteInputTokens,
    outputTokens: usage.outputTokens,
    priceModel: price.model,
  };
}
