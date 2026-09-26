import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTOML } from 'confbox/toml';
import { applyOptimization, editOptimizationConfig, optimizationOverview, previewOptimization, readOptimizationHeader, undoOptimization, verifyOptimization } from '../../src/context/optimization';
import { responseSavingsCost } from '../../src/context/optimizationSavings';
import type { CodexUsageRecord } from '../../src/benefit/types';
import { scanCodexSessions } from '../../src/benefit/codexSessions';
import { readCodexSkillCatalogs } from '../../src/context/codexSkillCatalog';

describe('verified optimization flow', () => {
  let root: string; let project: string; let home: string; let sessions: string;
  const now = new Date('2026-09-18T12:00:00Z');
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
    root = realpathSync(mkdtempSync(join(tmpdir(), 'optimization-'))); project = join(root, 'project'); home = join(root, 'home'); sessions = join(home, '.codex/sessions');
    mkdirSync(join(project, '.codex'), { recursive: true }); mkdirSync(sessions, { recursive: true });
  });
  afterEach(() => { vi.useRealTimers(); rmSync(root, { recursive: true, force: true }); });
  function fixture(id = 'baseline', options: { skill?: boolean; skillText?: string; memory?: boolean; plugins?: boolean; fork?: boolean; mismatch?: boolean; version?: string; timestamp?: string; ordinal?: number; model?: string } = {}) {
    const timestamp = options.timestamp ?? new Date(now.getTime() - 60_000).toISOString();
    const kinds = ['generic.developer_instructions', ...(options.skill === false ? [] : ['host_skills.instructions']), ...(options.memory === false ? [] : ['memories.instructions']), ...(options.plugins === false ? [] : ['plugins.usage_instructions', 'plugins.recommendations'])];
    const texts: Record<string, string> = { 'generic.developer_instructions': 'Base instructions', 'host_skills.instructions': '<skills_instructions>Skills available for coding</skills_instructions>', 'memories.instructions': 'Historical preferences and working conventions.', 'plugins.usage_instructions': 'Plugin tools and skills available.', 'plugins.recommendations': 'Recommended plugins for this task.' };
    if (options.skillText !== undefined) texts['host_skills.instructions'] = options.skillText;
    const entries = [
      { type: 'session_meta', payload: { id, cwd: project, timestamp, cli_version: options.version ?? '0.154.0-alpha.6.2', source: 'cli', history_mode: 'paginated', history_base: { end_ordinal_exclusive: options.fork ? 120 : 0 }, ...(options.fork ? { forked_from_id: 'parent' } : {}) } },
      { type: 'response_item', payload: { type: 'message', role: 'developer', content: kinds.map((kind) => ({ type: 'input_text', text: texts[kind] })), internal_chat_message_metadata_passthrough: { content_item_kinds: options.mismatch ? kinds.slice(1) : kinds } } },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'project' }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['agents_md.instructions'] } } },
      { type: 'world_state', payload: { full: true, state: {} } },
      { type: 'turn_context', payload: { turn_id: 'turn1', cwd: project, model: options.model ?? 'gpt-6-astra' } },
      { type: 'token_usage_record', payload: { session_id: id, thread_id: id, response_id: 'response1', turn_id: 'turn1', usage: { input_tokens: 1000, cached_input_tokens: 800, cache_write_input_tokens: 0, output_tokens: 100, reasoning_output_tokens: 20, total_tokens: 1100 } } },
    ];
    const path = join(sessions, `${id}.jsonl`);
    writeFileSync(path, entries.map((entry, ordinal) => JSON.stringify({ timestamp, ordinal: ordinal + (options.ordinal ?? 0), ...entry })).join('\n') + '\n');
    return path;
  }
  it('requires ordinal-zero complete metadata, but accepts a non-inherited paginated task', () => {
    expect(readOptimizationHeader(fixture()).complete).toBe(true);
    expect(readOptimizationHeader(fixture('fork', { fork: true })).complete).toBe(false);
    expect(readOptimizationHeader(fixture('mismatch', { mismatch: true })).complete).toBe(false);
    expect(readOptimizationHeader(fixture('fragment', { ordinal: 4 })).complete).toBe(false);
  });
  it('reads actual header skills and resolves root aliases without requiring files on disk', async () => {
    fixture('observed', { skillText: '<skills_instructions>\n### Skill roots\n- `r0` = `/missing/skills`\n### Available skills\n- tools:writer: Write documents. (file: r0/writer/SKILL.md)\n</skills_instructions>' });
    const { sessions: [catalog] } = await readCodexSkillCatalogs(project, home);
    expect(catalog).toMatchObject({ sessionId: 'observed', status: 'present', skills: [{ name: 'tools:writer', description: 'Write documents.', sourcePath: '/missing/skills/writer/SKILL.md' }] });
    expect(catalog.tokens).toBeGreaterThan(0);
  });
  it('distinguishes missing catalogs from inherited, mismatched, and incomplete headers', async () => {
    fixture('absent', { skill: false }); fixture('fork', { fork: true }); fixture('mismatch', { mismatch: true });
    fixture('truncated', { skillText: '<skills_instructions>\n### Available skills\n- unfinished: Example' });
    const { sessions: catalogs } = await readCodexSkillCatalogs(project, home);
    expect(catalogs.find((item) => item.sessionId === 'absent')).toMatchObject({ status: 'absent', tokens: 0, skills: [] });
    for (const id of ['fork', 'mismatch', 'truncated']) expect(catalogs.find((item) => item.sessionId === id)).toMatchObject({ status: 'unknown', skills: [] });
  });
  it('does not mistake skill tags in memory for the real catalog or invent a filesystem fallback', async () => {
    const path = fixture('quoted', { skill: false });
    const entries = readFileSync(path, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    entries[1].payload.content[1].text = '<skills_instructions>\n### Available skills\n- invented: Not a real catalog\n</skills_instructions>';
    writeFileSync(path, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
    const report = await readCodexSkillCatalogs(project, home);
    expect(report.sessions[0]).toMatchObject({ status: 'absent', skills: [] });
    rmSync(path);
    expect((await readCodexSkillCatalogs(project, home)).sessions).toEqual([]);
  });
  it('uses recent activity order without falling back from a newer absent catalog to an older present one', async () => {
    fixture('older', { timestamp: '2026-08-01T12:00:00Z' });
    fixture('newer', { skill: false });
    const report = await readCodexSkillCatalogs(project, home);
    expect(report.sessions.map((item) => item.sessionId)).toEqual(['newer', 'older']);
    expect(report.sessions[0].status).toBe('absent');
  });
  it('reports session usage and bounded savings without double-counting cached input or reasoning', async () => {
    fixture();
    const { sessions: [session] } = await optimizationOverview(project, home);
    expect(session.usage).toMatchObject({ inputTokens: 1000, cachedInputTokens: 800, outputTokens: 100, totalTokens: 1100 });
    expect(session.cost).toBeCloseTo(0.0131);
    expect(session.suggestions[0]).toMatchObject({ available: true, scope: 'project' });
    expect(session.suggestions[0].cost!.upper).toBeGreaterThan(session.suggestions[0].cost!.lower);
    expect(session.suggestions[2]).toMatchObject({ id: 'plugins', available: true, scope: 'user', configKey: 'features.plugins' });
    expect(session.suggestions[2].tokens).toBeGreaterThan(0);
    const original = '<skills_instructions>Skills available for coding</skills_instructions>';
    expect(session.headerBlocks?.find((block) => block.kind === 'host_skills.instructions')).toEqual({ kind: 'host_skills.instructions', excerpt: original.slice(0, 50), characters: original.length, target: 'skill-catalog' });
  });
  it('uses project-over-global skill catalog configuration and keeps absent complete sessions selectable with zero savings', async () => {
    fixture('observed');
    fixture('absent', { skill: false });
    fixture('plugins-absent', { plugins: false });
    const global = join(home, '.codex/config.toml');
    writeFileSync(global, '[skills]\ninclude_instructions = false\n');
    let report = await optimizationOverview(project, home);
    expect(report.sessions.find((session) => session.id === 'observed')?.suggestions[0]).toMatchObject({ configuredOff: true, available: false, canEnable: true, configValues: { global: false, effective: false, source: 'global' } });
    writeFileSync(join(project, '.codex/config.toml'), '[skills]\ninclude_instructions = true\n');
    report = await optimizationOverview(project, home);
    expect(report.sessions.find((session) => session.id === 'observed')?.suggestions[0]).toMatchObject({ configuredOff: false, available: true, configValues: { project: true, global: false, effective: true, source: 'project' } });
    expect(report.sessions.find((session) => session.id === 'absent')?.suggestions[0]).toMatchObject({ available: true, reason: 'absent', tokens: 0, cumulative: { tokens: 0, coveredResponses: 0, pricedResponses: 0 } });
    expect(report.sessions.find((session) => session.id === 'plugins-absent')?.suggestions[2]).toMatchObject({ available: true, reason: 'absent', tokens: 0, cumulative: { tokens: 0, coveredResponses: 0, pricedResponses: 0 } });
  });
  it.each([
    ['gpt-6-sol', 0.00156],
    ['gpt-6-luna', 0.000078],
  ] as const)('calculates historical usage and savings for %s', async (model, expected) => {
    fixture('new-model', { model });
    const { sessions: [session] } = await optimizationOverview(project, home);
    expect(session.actualCost).toBeCloseTo(expected, 10);
    expect(session.actualCostCoverage).toBe(1);
    expect(session.suggestions[0].actualCost!.lower).toBeGreaterThan(0);
    expect(session.suggestions[0].cumulative!.actualPricedResponses).toBe(1);
  });

  it('defaults to the highest-priced model while retaining the actual model estimate', async () => {
    fixture('cheap', { model: 'gpt-5.6-luna' });
    const { sessions: [session] } = await optimizationOverview(project, home);
    expect(session.cost).toBeCloseTo(0.0131);
    expect(session.actualCost).toBeCloseTo(0.000292);
    expect(session.suggestions[0].cost!.upper).toBeGreaterThan(session.suggestions[0].actualCost!.upper);
    expect(session.suggestions[0].cumulative!.cost!.upper).toBeGreaterThan(session.suggestions[0].cumulative!.actualCost!.upper);
  });
  it('keeps a complete original baseline outside the selected period without mixing session blocks', async () => {
    fixture('oldest-incomplete', { timestamp: '2026-07-01T12:00:00Z', plugins: false });
    fixture('original', { timestamp: '2026-08-01T12:00:00Z', skillText: 'Original skills '.repeat(20) });
    fixture('current', { skill: false, plugins: false });
    const report = await optimizationOverview(project, home, 'week');
    expect(report.sessions.map((session) => session.id)).toEqual(['current']);
    expect(report.previewBaseline?.id).toBe('original');
    expect(report.previewBaseline?.blocks.find((block) => block.target === 'skill-catalog')?.text).toBe('Original skills '.repeat(20));
    expect(new Set(report.previewBaseline?.blocks.map((block) => block.target))).toEqual(new Set([undefined, 'skill-catalog', 'memory', 'plugins']));
  });
  it('scans the complete selected calendar period instead of a daily slice', async () => {
    fixture('month-old', { timestamp: '2026-09-03T12:00:00.000Z' });
    fixture('this-week', { timestamp: '2026-09-18T11:00:00.000Z' });
    const month = await optimizationOverview(project, home, 'month');
    const week = await optimizationOverview(project, home, 'week');
    expect(month.period).toBe('month');
    expect(month.sessions).toHaveLength(2);
    expect(month.maxPriceModel).toBe('gpt-6-astra');
    expect(week.period).toBe('week');
    expect(week.sessions).toHaveLength(1);
  });
  it('accumulates each retained response across turns and stops extrapolating after compaction', async () => {
    const path = fixture();
    const entries = readFileSync(path, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const append = (type: string, payload: any) => entries.push({ timestamp: entries[0].timestamp, ordinal: entries.length, type, payload });
    append('token_usage_record', { ...entries[5].payload, response_id: 'response2' });
    append('turn_context', { turn_id: 'turn2', cwd: project, model: 'gpt-6-astra' });
    append('token_usage_record', { ...entries[5].payload, response_id: 'response3', turn_id: 'turn2', usage: { ...entries[5].payload.usage, cached_input_tokens: 0 } });
    const save = () => writeFileSync(path, entries.map((item) => JSON.stringify(item)).join('\n') + '\n');
    save();
    let session = (await optimizationOverview(project, home)).sessions[0];
    const first = session.suggestions[1].tokens!;
    expect(session).toMatchObject({ turnCount: 2, responseCount: 3 });
    expect(session.suggestions[1].cumulative).toMatchObject({ tokens: first * 3, coveredResponses: 3, pricedResponses: 3 });
    expect(session.suggestions[1].cumulative!.cost!.lower).toBeCloseTo(first * (2 + 2 + 20) / 1_000_000);
    expect(session.suggestions[1].cumulative!.cost!.upper).toBeCloseTo(first * 60 / 1_000_000);
    append('compacted', {});
    append('token_usage_record', { ...entries[5].payload, response_id: 'response4', turn_id: 'turn2' });
    save();
    session = (await optimizationOverview(project, home)).sessions[0];
    expect(session.responseCount).toBe(4);
    expect(session.suggestions[1].cumulative).toMatchObject({ tokens: first * 3, coveredResponses: 3 });
    append('response_item', { role: 'developer', content: [{ type: 'input_text', text: 'short' }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['memories.instructions'] } });
    append('turn_context', { turn_id: 'turn3', cwd: project, model: 'unknown-price' });
    append('token_usage_record', { ...entries[5].payload, response_id: 'response5', turn_id: 'turn3' });
    save();
    session = (await optimizationOverview(project, home)).sessions[0];
    expect(session.turnCount).toBe(3);
    expect(session.suggestions[1].cumulative).toMatchObject({ tokens: first * 3 + 1, coveredResponses: 4, pricedResponses: 4, actualPricedResponses: 3 });
    expect(session.suggestions[1].cumulative!.cost!.lower).toBeCloseTo((first * 24 + 2) / 1_000_000);
    expect(session.suggestions[1].cumulative!.actualCost!.lower).toBeCloseTo(first * 24 / 1_000_000);
  });
  it('does not offer actions for an unknown runtime or absent targets', async () => {
    fixture('future', { version: 'unknown', skill: false });
    const report = await optimizationOverview(project, home);
    expect(report.sessions[0].suggestions.every((item) => !item.available)).toBe(true);
    await expect(previewOptimization(project, 'future', 'memory', home)).rejects.toThrow('unavailable');
  });
  it('allows a newer runtime and re-enables an already disabled block without requiring its presence', async () => {
    fixture('baseline', { version: '0.155.0-alpha.9', skill: false });
    const config = join(project, '.codex/config.toml');
    writeFileSync(config, '[skills]\ninclude_instructions = false\n');
    const report = await optimizationOverview(project, home);
    expect(report.sessions[0].suggestions[1]).toMatchObject({ available: true, versionWarning: true });
    expect(report.sessions[0].suggestions[0]).toMatchObject({ available: false, canEnable: true });
    const preview = await previewOptimization(project, 'baseline', 'skill-catalog', home, true);
    await expect(applyOptimization(project, 'baseline', 'skill-catalog', preview.confirmation, home, false)).rejects.toThrow();
    const op = await applyOptimization(project, 'baseline', 'skill-catalog', preview.confirmation, home, true);
    expect(parseTOML<any>(readFileSync(config, 'utf8')).skills.include_instructions).toBe(true);
    vi.setSystemTime(now.getTime() + 2000);
    fixture('fresh', { version: '0.155.0-alpha.9', timestamp: new Date(now.getTime() + 1000).toISOString() });
    expect(await verifyOptimization(project, op.id, home)).toMatchObject({ status: 'present', matched: true });
    undoOptimization(project, op.id, home);
    expect(parseTOML<any>(readFileSync(config, 'utf8')).skills.include_instructions).toBe(false);
  });
  it('shows one row per task when another rollout file repeats the same session ID', async () => {
    const path = fixture();
    writeFileSync(join(sessions, 'duplicate.jsonl'), readFileSync(path, 'utf8'));
    const report = await optimizationOverview(project, home);
    expect(report.sessions).toHaveLength(1);
    expect(report.sessions[0].usage?.totalTokens).toBe(1100);
  });
  it('keeps recorded usage unchanged when expensive historical context reconstruction is skipped', async () => {
    fixture();
    const options = { projectDir: project, homeDir: home, sinceMs: now.getTime() - 86400_000 };
    const full = await scanCodexSessions(options);
    const quick = await scanCodexSessions({ ...options, includeContext: false, exactProjectOnly: true, useIndex: true });
    expect(quick.selected[0].summary).toEqual(full.selected[0].summary);
    expect(quick.selected[0].analysis.modelContexts).toEqual(full.selected[0].analysis.modelContexts);
    expect(quick.selected[0].analysis.contextSnapshots).toEqual([]);
    expect(quick.index.enabled).toBe(false);
  });
  it('does not parse another project body when exact project selection is requested', async () => {
    fixture();
    const other = fixture('other-project');
    writeFileSync(other, readFileSync(other, 'utf8').replaceAll(project, home) + 'invalid unrelated body\n');
    const report = await scanCodexSessions({ projectDir: project, homeDir: home, sinceMs: now.getTime() - 86400_000, includeContext: false, exactProjectOnly: true });
    expect(report.selected).toHaveLength(1);
    expect(report.diagnostics.some((item) => item.code === 'session.invalid_json')).toBe(false);
  });
  it('writes only the project catalog key, stays pending, verifies a fresh header and restores the key', async () => {
    fixture();
    const config = join(project, '.codex/config.toml');
    writeFileSync(config, '# keep\nmodel = "local"\n');
    const preview = await previewOptimization(project, 'baseline', 'skill-catalog', home);
    const op = await applyOptimization(project, 'baseline', 'skill-catalog', preview.confirmation, home);
    expect(op.status).toBe('pending');
    expect(parseTOML<any>(readFileSync(config, 'utf8')).skills.include_instructions).toBe(false);
    expect(await verifyOptimization(project, op.id, home)).toMatchObject({ status: 'unknown', reason: 'new-task-required' });
    vi.setSystemTime(now.getTime() + 2000);
    fixture('fresh', { skill: false, timestamp: new Date(now.getTime() + 1000).toISOString() });
    expect(await verifyOptimization(project, op.id, home)).toMatchObject({ status: 'removed', sessionId: 'fresh' });
    writeFileSync(config, readFileSync(config, 'utf8') + '\n[unrelated]\nkeep = true\n');
    expect(await verifyOptimization(project, op.id, home)).toMatchObject({ status: 'unknown', reason: 'config-changed' });
    expect(undoOptimization(project, op.id, home).status).toBe('restored');
    const restored = parseTOML<any>(readFileSync(config, 'utf8'));
    expect(restored.skills.include_instructions).toBeUndefined(); expect(restored.unrelated.keep).toBe(true);
  });
  it('writes memory only to the user config and rejects stale confirmation', async () => {
    fixture();
    const global = join(home, '.codex/config.toml');
    writeFileSync(global, '[memories]\nuse_memories = true\ngenerate_memories = true\n');
    const preview = await previewOptimization(project, 'baseline', 'memory', home);
    expect(preview.scope).toBe('user');
    writeFileSync(global, readFileSync(global, 'utf8') + '\n# external edit');
    await expect(applyOptimization(project, 'baseline', 'memory', preview.confirmation, home)).rejects.toThrow('changed');
    const fresh = await previewOptimization(project, 'baseline', 'memory', home);
    const op = await applyOptimization(project, 'baseline', 'memory', fresh.confirmation, home);
    expect(parseTOML<any>(readFileSync(global, 'utf8')).memories).toEqual({ use_memories: false, generate_memories: true });
    vi.setSystemTime(now.getTime() + 2000);
    fixture('still-present', { timestamp: new Date(now.getTime() + 1000).toISOString() });
    expect(await verifyOptimization(project, op.id, home)).toMatchObject({ status: 'present' });
    undoOptimization(project, op.id, home);
    expect(parseTOML<any>(readFileSync(global, 'utf8')).memories.use_memories).toBe(true);
  });
  it('applies project and global controls together and verifies every selected block', async () => {
    fixture();
    const config = join(project, '.codex/config.toml');
    const global = join(home, '.codex/config.toml');
    writeFileSync(config, 'model = "local"\n');
    writeFileSync(global, '[memories]\nuse_memories = true\ngenerate_memories = true\n');
    const preview = await previewOptimization(project, 'baseline', ['skill-catalog', 'memory', 'plugins'], home);
    expect(preview).toMatchObject({ targets: ['skill-catalog', 'memory', 'plugins'], scope: 'mixed', configKeys: ['skills.include_instructions', 'memories.use_memories', 'features.plugins'], after: false });
    const op = await applyOptimization(project, 'baseline', ['skill-catalog', 'memory', 'plugins'], preview.confirmation, home);
    expect(op.targets).toEqual(['skill-catalog', 'memory', 'plugins']);
    expect(parseTOML<any>(readFileSync(config, 'utf8'))).toMatchObject({ model: 'local', skills: { include_instructions: false } });
    expect(parseTOML<any>(readFileSync(global, 'utf8'))).toMatchObject({ memories: { use_memories: false, generate_memories: true }, features: { plugins: false } });
    vi.setSystemTime(now.getTime() + 2000);
    fixture('fresh', { skill: false, memory: false, plugins: false, timestamp: new Date(now.getTime() + 1000).toISOString() });
    expect(await verifyOptimization(project, op.id, home)).toMatchObject({ status: 'removed', sessionId: 'fresh', targets: [{ id: 'skill-catalog', status: 'removed' }, { id: 'memory', status: 'removed' }, { id: 'plugins', status: 'removed' }] });
    expect(undoOptimization(project, op.id, home).status).toBe('restored');
    expect(parseTOML<any>(readFileSync(config, 'utf8'))).toMatchObject({ model: 'local' });
    expect(parseTOML<any>(readFileSync(global, 'utf8'))).toMatchObject({ memories: { use_memories: true, generate_memories: true } });
    expect(parseTOML<any>(readFileSync(global, 'utf8')).features?.plugins).toBeUndefined();
  });
  it('rejects unsupported layouts, arbitrary targets, and symlinked configuration', async () => {
    expect(() => editOptimizationConfig('skills.include_instructions = true', 'skill-catalog', false)).toThrow();
    expect(() => editOptimizationConfig('', 'recommendations' as any, false)).toThrow('Unsupported');
    fixture(); const outside = join(root, 'outside'); writeFileSync(outside, ''); symlinkSync(outside, join(project, '.codex/config.toml'));
    await expect(optimizationOverview(project, home)).rejects.toThrow('symlink');
  });
  it('does not offer global memory changes when a project or profile overrides the key', async () => {
    fixture();
    writeFileSync(join(project, '.codex/config.toml'), '[memories]\nuse_memories = true\n');
    let report = await optimizationOverview(project, home);
    expect(report.sessions[0].suggestions[1]).toMatchObject({ available: false, reason: 'config-override' });
    writeFileSync(join(project, '.codex/config.toml'), '[profiles.custom.skills]\ninclude_instructions = true\n');
    report = await optimizationOverview(project, home);
    expect(report.sessions[0].suggestions[0]).toMatchObject({ available: false, reason: 'config-override' });
  });
});


it.each([
  ['gpt-6-sol', 0.1, 0.001],
  ['gpt-6-luna', 0.005, 0.00005],
] as const)('includes full-request repricing when %s savings cross 272k', (model, outputSavings, tokenSavings) => {
  const record: CodexUsageRecord = {
    sessionId: 'test', threadId: 'test', responseId: 'response', timestamp: '2026-09-26T00:00:00Z',
    model, sourcePath: '/fixture.jsonl', line: 1, archived: false, sourceKind: 'token_usage_record', quality: 'complete',
    usage: { inputTokens: 272_100, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 20_000, reasoningOutputTokens: 0, totalTokens: 292_100 },
  };
  const result = responseSavingsCost(500, record);
  const inputRate = model === 'gpt-6-sol' ? 2 : 0.1;
  const expected = 272_100 * inputRate / 1_000_000 + tokenSavings + outputSavings;
  expect(result?.lower).toBeCloseTo(expected, 10);
  expect(result?.upper).toBeCloseTo(expected, 10);
  expect(responseSavingsCost(0, record)).toEqual({ lower: 0, upper: 0, currency: 'USD' });
});
