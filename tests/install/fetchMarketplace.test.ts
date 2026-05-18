import { describe, expect, it, vi, afterEach } from 'vitest';
import { fetchMarketplaceSkill } from '../../src/install/fetchMarketplace.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchMarketplaceSkill', () => {
  it('returns skill content for a valid slug', async () => {
    const mockContent = '---\nname: test-skill\ndescription: A test\n---\n# Test';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockContent,
    }));

    const result = await fetchMarketplaceSkill('test-skill');
    expect(result).toBe(mockContent);
  });

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }));

    await expect(fetchMarketplaceSkill('nonexistent')).rejects.toThrow(
      "Skill 'nonexistent' not found in marketplace (404)",
    );
  });
});
