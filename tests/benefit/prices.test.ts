import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { calculateBenefitCost, DEFAULT_BENEFIT_PRICE_TABLE, findBenefitPrice, loadBenefitPriceTable } from '../../src/benefit/prices';

describe('benefit pricing', () => {
  const price = {
    model: 'test-model',
    provider: 'test',
    currency: 'USD',
    inputPerMillion: 10,
    cachedInputPerMillion: 1,
    cacheWriteInputPerMillion: 20,
    outputPerMillion: 30,
    maxInputTokens: 200_000,
  };

  it('separates ordinary, cached, write, and output pricing', () => {
    const result = calculateBenefitCost({
      inputTokens: 100,
      cachedInputTokens: 20,
      cacheWriteInputTokens: 10,
      outputTokens: 5,
    }, price);

    expect(result).toMatchObject({
      status: 'estimated',
      ordinaryInputTokens: 70,
      cachedInputTokens: 20,
      cacheWriteInputTokens: 10,
      outputTokens: 5,
    });
    expect(result.amount).toBeCloseTo((70 * 10 + 20 * 1 + 10 * 20 + 5 * 30) / 1_000_000);
  });

  it('does not guess an unknown model or invalid cache partition', () => {
    expect(calculateBenefitCost({ inputTokens: 10, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 1 }, undefined).status).toBe('unknown');
    expect(calculateBenefitCost({ inputTokens: 10, cachedInputTokens: 9, cacheWriteInputTokens: 2, outputTokens: 1 }, price).status).toBe('unknown');
    expect(findBenefitPrice('TEST-MODEL', { schemaVersion: 1, name: 'test', updatedAt: '2026-09-07', channel: 'test', serviceTier: 'test', unit: 'USD per 1M tokens', prices: [price] })).toBe(price);
  });

  it('rejects input above a single-tier price guardrail instead of extrapolating', () => {
    const result = calculateBenefitCost({
      inputTokens: 201,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 1,
    }, { ...price, maxInputTokens: 200 });

    expect(result).toMatchObject({ status: 'unknown', priceModel: 'test-model' });
    expect(result.reason).toContain('200');
  });

  it('applies explicit long-context input tiers', () => {
    const result = calculateBenefitCost({
      inputTokens: 200,
      cachedInputTokens: 50,
      cacheWriteInputTokens: 0,
      outputTokens: 1,
    }, {
      ...price,
      inputTiers: [
        { upToInputTokens: 100, inputPerMillion: 10, cachedInputPerMillion: 1 },
        { inputPerMillion: 20, cachedInputPerMillion: 2 },
      ],
    });

    expect(result.status).toBe('estimated');
    expect(result.amount).toBeGreaterThan(0);
  });

  it('rejects a custom price without an applicability range', () => {
    const { maxInputTokens: _ignored, ...unbounded } = price;
    expect(calculateBenefitCost({ inputTokens: 10, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 1 }, unbounded)).toMatchObject({ status: 'unknown' });
  });

  it('does not extrapolate beyond the last explicit tier', () => {
    const result = calculateBenefitCost({ inputTokens: 201, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 1 }, {
      ...price,
      inputTiers: [{ upToInputTokens: 200, inputPerMillion: 10, cachedInputPerMillion: 1, cacheWriteInputPerMillion: 20 }],
    });
    expect(result).toMatchObject({ status: 'unknown', priceModel: 'test-model' });
    expect(result.reason).toContain('applicable tier');
  });
});


describe.each([
  { model: 'gpt-6-sol', input: 2, cached: 0.2, writes: 2.5, output: 10 },
  { model: 'gpt-6-luna', input: 0.1, cached: 0.01, writes: 0.125, output: 0.5 },
])('$model standard pricing', ({ model, input, cached, writes, output }) => {
  it.each([1000, 272_000, 272_001, 1_050_000])('prices %i input tokens with full-request rates', (inputTokens) => {
    const price = findBenefitPrice(model, DEFAULT_BENEFIT_PRICE_TABLE);
    const result = calculateBenefitCost({ inputTokens, cachedInputTokens: 200, cacheWriteInputTokens: 100, outputTokens: 50 }, price);
    const inputMultiplier = inputTokens > 272_000 ? 2 : 1;
    const outputMultiplier = inputTokens > 272_000 ? 1.5 : 1;
    expect(result).toMatchObject({ status: 'estimated', currency: 'USD', priceModel: model });
    expect(result.amount).toBeCloseTo(((inputTokens - 300) * input * inputMultiplier + 200 * cached * inputMultiplier + 100 * writes * inputMultiplier + 50 * output * outputMultiplier) / 1_000_000, 10);
  });

  it('rejects input beyond the supported range', () => {
    expect(calculateBenefitCost({ inputTokens: 1_050_001, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 1 }, findBenefitPrice(model, DEFAULT_BENEFIT_PRICE_TABLE)).status).toBe('unknown');
  });
});

it('loads valid long-context rules and rejects invalid or conflicting rules', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'benefit-price-'));
  const path = join(dir, 'prices.json');
  const price = findBenefitPrice('gpt-6-sol', DEFAULT_BENEFIT_PRICE_TABLE)!;
  try {
    await writeFile(path, JSON.stringify({ ...DEFAULT_BENEFIT_PRICE_TABLE, prices: [price] }));
    expect((await loadBenefitPriceTable(path)).prices[0].longContext).toEqual(price.longContext);
    for (const invalid of [null, {}, { ...price.longContext, inputMultiplier: -1 }, { ...price.longContext, aboveInputTokens: '272000' }]) {
      await writeFile(path, JSON.stringify({ ...DEFAULT_BENEFIT_PRICE_TABLE, prices: [{ ...price, longContext: invalid }] }));
      await expect(loadBenefitPriceTable(path)).rejects.toThrow('valid prices');
    }
    await writeFile(path, JSON.stringify({ ...DEFAULT_BENEFIT_PRICE_TABLE, prices: [{ ...price, inputTiers: [] }] }));
    await expect(loadBenefitPriceTable(path)).rejects.toThrow('valid prices');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
