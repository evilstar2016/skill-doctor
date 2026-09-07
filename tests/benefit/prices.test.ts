import { describe, expect, it } from 'vitest';

import { calculateBenefitCost, findBenefitPrice } from '../../src/benefit/prices';

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
