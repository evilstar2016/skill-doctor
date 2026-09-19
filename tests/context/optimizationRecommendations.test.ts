import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { optimizationRecommendations } from '../../src/context/optimizationRecommendations';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'recommendations-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));
const start = new Date('2026-09-01'); const end = new Date('2026-10-01');
const user = (text: string) => ({ type: 'message', role: 'user', content: [{ type: 'input_text', text }] });
function log(name: string, payloads: unknown[], offset = 0): string {
  const path = join(root, `${name}.jsonl`);
  writeFileSync(path, payloads.map((payload, ordinal) => JSON.stringify({ ordinal: ordinal + offset, timestamp: '2026-09-19T00:00:00Z', type: 'response_item', payload })).join('\n') + '\n');
  return path;
}
it('aggregates repeated explicit requests for the same skill and plugin across sessions', async () => {
  const text = 'Use [$writer](/skills/writer/SKILL.md) and [tools](plugin://tools).';
  const result = await optimizationRecommendations([log('one', [user(text)]), log('two', [user(text)])], start, end);
  expect(result['skill-catalog']).toMatchObject({ reason: 'explicit-repeat', explicitRequests: 2, sessions: 2 });
  expect(result.plugins.reason).toBe('explicit-repeat');
});
it('does not count injected catalogs, quoted references, or unrelated dollar variables as requests', async () => {
  const injected = { ...user('[$writer](/skills/writer/SKILL.md)'), internal_chat_message_metadata_passthrough: { content_item_kinds: ['host_skills.instructions'] } };
  const result = await optimizationRecommendations([log('one', [injected, injected, user('Explain $HOME\n> [tools](plugin://tools)\n```\n[tools](plugin://tools)\n```')])], start, end);
  expect(result.plugins).toMatchObject({ reason: 'no-observed-use', explicitRequests: 0 });
  expect(result['skill-catalog'].explicitRequests).toBe(0);
});
it('does not infer non-use from empty, partial, or tool-using logs', async () => {
  for (const paths of [[], [log('partial', [user('hello')], 4)], [log('tool', [user('hello'), { type: 'function_call', name: 'mcp__tools__search' }])]]) {
    const result = await optimizationRecommendations(paths, start, end);
    expect(result.plugins.reason).toBe('insufficient-evidence');
  }
});
it('counts each item only once per message and restricts evidence to the chosen period', async () => {
  const path = log('one', [user('[x](plugin://x) [x](plugin://x)')]);
  expect((await optimizationRecommendations([path], start, end)).plugins.explicitRequests).toBe(1);
  expect((await optimizationRecommendations([path], new Date('2026-09-20'), end)).plugins.reason).toBe('insufficient-evidence');
});
