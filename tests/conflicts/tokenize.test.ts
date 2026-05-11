import { describe, expect, it } from 'vitest';

import { tokenize } from '../../src/conflicts/tokenize';

describe('tokenize', () => {
  it('normalizes mixed text into useful conflict tokens', () => {
    expect([...tokenize('Create a PR with gitCommit and pull-request flow')].sort()).toEqual([
      'commit',
      'create',
      'flow',
      'git',
      'pull',
      'request',
    ]);
  });

  it('filters short tokens and common stopwords', () => {
    expect([...tokenize('the and is 在 的 用 pr ai to')]).toEqual([]);
  });

  it('returns an empty set for empty input', () => {
    expect(tokenize('')).toEqual(new Set());
  });
});