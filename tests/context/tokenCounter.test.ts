import { describe, expect, it } from 'vitest';
import { createTokenCounter } from '../../src/context/tokenCounter';

describe('verbatim context token counting', () => {
  it('preserves transport whitespace when requested without changing default estimates', () => {
    const text = 'word\n\n\n\n        word';
    expect(createTokenCounter({ tokenizer: 'approx', preserveWhitespace: true }).count(text)).toBe(Math.ceil(text.length / 4));
    expect(createTokenCounter({ tokenizer: 'approx' }).count(text)).toBe(3);
    const raw = createTokenCounter({ preserveWhitespace: true });
    expect(raw.count(text)).toBeGreaterThan(createTokenCounter().count(text));
    expect(raw.count('')).toBe(0);
  });
});
