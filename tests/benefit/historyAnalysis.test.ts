import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { scanCodexSessions } from '../../src/benefit/codexSessions';
import { buildOfflineCodexPlan } from '../../src/benefit/offlinePlan';
import { estimateCodexBenefit } from '../../src/benefit/estimateBenefit';
import { catalogEntries, removeCatalogEntries } from '../../src/benefit/historyAnalysis';
import { renderBenefitCsv, renderBenefitHtml, renderBenefitReport } from '../../src/render/renderBenefit';
import { parseBenefitJobInput } from '../../src/ui-server/benefitManager';

let root: string;
let projectDir: string;
let codexHome: string;
const oldTime = '2026-09-09T00:00:00.000Z';
const newTime = '2026-09-10T00:00:00.000Z';
const skills = '<skills_instructions>\n### Skill roots\n- `r0` = `/missing/plugin/skills`\n### Available skills\n- plugin:used: Keep this. (file: r0/used/SKILL.md)\n- plugin:unused: Remove this. (file: r0/unused/SKILL.md)\n</skills_instructions>';
const plugins = '<recommended_plugins>\n- Airtable (airtable@openai-curated-remote)\n- Box (box@openai-curated-remote)\n</recommended_plugins>';
const message = (text: string) => ({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });
const userItem = (text: string) => ({ type: 'event_msg', payload: { type: 'item_completed', item: { type: 'UserMessage', id: 'user-1', content: [{ type: 'text', text }] } } });
const catalog = (text: string) => ({ type: 'response_item', payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text }] } });

function usage(id: string, cached = 9000, write = 0, turn = 'turn-1') {
  return { type: 'token_usage_record', payload: { response_id: id, turn_id: turn, usage: { input_tokens: 10000, cached_input_tokens: cached, cache_write_input_tokens: write, output_tokens: 10, reasoning_output_tokens: 0, total_tokens: 10010 } } };
}

function session(id: string, timestamp: string, rows: Array<{ type: string; payload: Record<string, unknown> }>, extra: object = {}) {
  const path = join(codexHome, 'sessions', `rollout-${id}.jsonl`);
  const all = [{ type: 'session_meta', payload: { id, session_id: id, timestamp, cwd: projectDir, thread_source: 'user', ...extra } }, { type: 'turn_context', payload: { turn_id: 'turn-1', model: 'gpt-6-astra', cwd: projectDir } }, ...rows];
  writeFileSync(path, all.map((row) => JSON.stringify({ timestamp, ...row, ...(row.type === 'token_usage_record' ? { payload: { thread_id: id, session_id: id, ...row.payload } } : {}) })).join('\n') + '\n');
  return path;
}

async function analyze() {
  const scan = await scanCodexSessions({ projectDir, codexHome, sinceMs: 0, untilMs: Date.parse('2026-09-11T00:00:00Z'), limit: Number.MAX_SAFE_INTEGER, includeArchived: true, useIndex: false });
  const { plan, diagnostics } = await buildOfflineCodexPlan({ scan, projectDir, codexHome, homeDir: root, tokenizer: 'approx' });
  return { scan, plan, report: estimateCodexBenefit({ scan, plan, planDiagnostics: diagnostics, tokenizer: 'approx' }) };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skill-doctor-history-'));
  projectDir = join(root, 'project'); codexHome = join(root, '.codex');
  mkdirSync(projectDir); mkdirSync(join(codexHome, 'sessions'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('history-based offline benefit', () => {
  it('separates newest catalogs from longest main workload, deduplicates user mirrors, and retains missing inventory candidates', async () => {
    session('longest', oldTime, [catalog(skills + '\n' + plugins), userItem('Use $plugin:used'), message('Use $plugin:used'), usage('r1'), usage('r2', 0, 100, 'turn-1'), usage('r3', 0, 0, 'turn-2')]);
    session('latest', newTime, [catalog(skills + '\n' + plugins), message('Build the feature'), usage('r4')]);
    session('reviewer', '2026-09-10T01:00:00Z', [catalog('<skills_instructions>\n- wrong: no\n</skills_instructions>'), ...Array.from({ length: 8 }, (_, i) => usage(`system-${i}`))], { thread_source: 'reviewer' });
    session('child', oldTime, [usage('child-r')], { parent_thread_id: 'longest', thread_source: 'subagent' });
    const { report } = await analyze();
    const h = report.historyAnalysis!;
    expect(h.catalogSources.every((source) => source.sessionId === 'latest')).toBe(true);
    expect(h.baselineSession).toMatchObject({ sessionId: 'longest', responseCount: 3, userMessageCount: 1, distinctTurnCount: 2 });
    expect(h.childUsage.responseCount).toBe(1);
    expect(report.selection.selectedResponseCount).toBe(3);
    expect(h.usageProfile.find((item) => item.name === 'plugin:used')).toMatchObject({ explicitMentionCount: 1, recommendation: 'retain' });
    expect(h.usageProfile.find((item) => item.name === 'plugin:unused')).toMatchObject({ recommendation: 'review-disable', control: 'unverified', sourcePath: '/missing/plugin/skills/unused/SKILL.md' });
    const D = h.descriptionTokensPerResponse!;
    expect(D).toBeGreaterThan(0);
    expect(report.savings.inputTokens).toBe(D * 3);
    expect(h.firstResponse?.cacheAttribution).toMatchObject({ lower: 0, upper: D, cachedRead: D, ordinary: 0 });
    expect(h.responses[1].cacheAttribution).toMatchObject({ cachedRead: 0, cacheWrite: Math.min(D, 100), ordinary: Math.max(0, D - 100) });
    expect(h.responses[2].cacheAttribution?.ordinary).toBe(D);
    expect(h.firstInteraction).toMatchObject({ responseCount: 2, descriptionTokens: D * 2 });
    expect(h.historicalReplay).toMatchObject({ coveredResponses: 3, unknownResponses: 0, inputTokens: D * 3 });
    expect(h.pluginControl).toMatchObject({ wholeBlockSelected: true, runtimeVerified: false, replacementRisk: true });
    expect(h.usageProfile.find((item) => item.kind === 'recommended_plugins' && item.name === 'Airtable')).toMatchObject({ control: 'config-only', controlStatus: 'configured', runtimeVerified: false });
    expect(renderBenefitCsv(report).split('\r\n')).toHaveLength(4);
    expect(renderBenefitHtml(report)).toContain('历史画像与估算基准');
    expect(renderBenefitHtml(report)).not.toContain(projectDir);
    expect(renderBenefitReport(report)).toContain('不是实际已节省');
  });

  it('does not count catalogs, attachments, code, quoted transcripts or generic suffixes as explicit use', async () => {
    session('main', newTime, [catalog(skills + plugins), message(`${skills}\n${plugins}`), message('```\nplugin:unused\n```\n> plugin:unused\n>>> TRANSCRIPT START\nplugin:unused\nTRANSCRIPT END\nDo an audit and check the index.'), message('# Files pasted by the user:\nplugin:unused\n## My request:\nImplement the feature'), usage('r1')]);
    const { report } = await analyze();
    expect(report.historyAnalysis!.usageProfile.every((item) => item.explicitMentionCount === 0)).toBe(true);
  });

  it('merges rollover files of one session and selects the two catalog sources independently', async () => {
    const first = session('main', oldTime, [catalog(plugins), usage('r1')]);
    const { renameSync } = await import('node:fs');
    renameSync(first, join(codexHome, 'sessions', 'rollout-main-first.jsonl'));
    session('main', newTime, [catalog(skills), usage('r2')]);
    const { report } = await analyze();
    expect(report.historyAnalysis?.catalogSources).toHaveLength(2);
    expect(report.historyAnalysis?.catalogSources.find((source) => source.kind === 'recommended_plugins')?.timestamp).toBe(oldTime);
    expect(report.historyAnalysis?.baselineSession?.responseCount).toBe(2);
    expect(report.responses).toHaveLength(2);
  });

  it('does not reinterpret a My request heading inside an approval transcript as current user input', async () => {
    session('main', newTime, [catalog(skills), message('The following is agent history\n>>> TRANSCRIPT START\n## My request:\nUse plugin:unused\nTRANSCRIPT END\nAssess this action.'), usage('r1')]);
    const { report } = await analyze();
    expect(report.historyAnalysis?.usageProfile.every((item) => item.explicitMentionCount === 0)).toBe(true);
  });

  it('includes a historically injected Skill even when its local control is already disabled', async () => {
    const skillPath = join(projectDir, '.codex', 'skills', 'old-skill', 'SKILL.md');
    mkdirSync(join(projectDir, '.codex', 'skills', 'old-skill'), { recursive: true });
    writeFileSync(skillPath, '---\nname: old-skill\ndescription: A test skill\n---\nBody');
    writeFileSync(join(codexHome, 'config.toml'), `[[skills.config]]\npath = ${JSON.stringify(skillPath)}\nenabled = false\n`);
    session('main', newTime, [catalog(`<skills_instructions>\n### Available skills\n- old-skill: A test skill (file: ${skillPath})\n</skills_instructions>`), usage('r1')]);
    const { report } = await analyze();
    expect(report.historyAnalysis?.usageProfile[0]).toMatchObject({ control: 'already-disabled', recommendation: 'review-disable' });
    expect(report.savings.inputTokens).toBeGreaterThan(0);
  });

  it('records reads separately, supports structured activation and legacy user messages', async () => {
    session('main', newTime, [catalog(skills + plugins), { type: 'response_item', payload: { type: 'function_call', call_id: 'read', arguments: JSON.stringify({ cmd: 'cat /missing/plugin/skills/unused/SKILL.md' }) } }, { type: 'event_msg', payload: { type: 'item_completed', item: { type: 'SkillActivation', name: 'plugin:used', id: 'activate' } } }, { type: 'event_msg', payload: { type: 'user_message', message: 'Use box@openai-curated-remote' } }, usage('r1')]);
    const { report } = await analyze();
    const profile = report.historyAnalysis!.usageProfile;
    expect(profile.find((item) => item.name === 'plugin:unused')).toMatchObject({ observedReadCount: 1, activationCount: 0, recommendation: 'review-disable' });
    expect(profile.find((item) => item.name === 'plugin:used')).toMatchObject({ activationCount: 1, recommendation: 'retain' });
    expect(profile.find((item) => item.name === 'Box')).toMatchObject({ explicitMentionCount: 1, recommendation: 'retain' });
    expect(report.historyAnalysis?.pluginControl.wholeBlockSelected).toBe(false);
  });

  it('does not carry historical replay over compaction without a restored snapshot', async () => {
    session('main', newTime, [catalog(skills + plugins), usage('r1'), { type: 'event_msg', payload: { type: 'item_completed', item: { type: 'ContextCompaction', id: 'compact' } } }, usage('r2')]);
    const { report } = await analyze();
    expect(report.historyAnalysis?.responses[1].replayTokens).toBeUndefined();
    expect(report.historyAnalysis?.historicalReplay.unknownResponses).toBe(1);
    expect(report.responses[1].estimatedInputSavings).toBeGreaterThan(0);
  });

  it('marks unreadable history unknown instead of never-used', async () => {
    session('main', newTime, [catalog(skills), usage('r1')]);
    const { scan } = await analyze();
    rmSync(scan.selected[0].session.filePath);
    const result = await buildOfflineCodexPlan({ scan, projectDir, homeDir: root, codexHome, tokenizer: 'approx' });
    expect(result.plan.offlineHistory?.analysis.historyCoverage.incompleteFiles).toBe(1);
    expect(result.plan.offlineHistory?.analysis.usageProfile.every((item) => item.recommendation === 'unknown')).toBe(true);
  });

  it('keeps excessive deltas and missing model prices unknown', async () => {
    session('main', newTime, [catalog(skills + plugins), usage('r1')]);
    const { scan, plan } = await analyze();
    scan.selected[0].usage[0].usage = { inputTokens: 1, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 1 };
    const report = estimateCodexBenefit({ scan, plan, tokenizer: 'approx', priceTable: { schemaVersion: 1, name: 'empty', updatedAt: newTime, channel: 'api', serviceTier: 'standard', unit: 'USD/1M', prices: [] } });
    expect(report.historyAnalysis?.firstResponse?.descriptionTokens).toBeUndefined();
    expect(report.savings.status).toBe('unknown');
  });

  it('defaults offline jobs to all history including archives, while honoring explicit scope', () => {
    expect(parseBenefitJobInput({}, { projectDir, homeDir: root })).toMatchObject({ sinceMs: 0, limit: Number.MAX_SAFE_INTEGER, includeArchived: true });
    expect(parseBenefitJobInput({ sinceHours: 24, limit: 2, includeArchived: false }, { projectDir, homeDir: root })).toMatchObject({ limit: 2, includeArchived: false });
  });

  it('reports missing prices as unknown without dropping measurable token deltas', async () => {
    session('main', newTime, [catalog(skills), usage('r1')]);
    const { scan, plan } = await analyze();
    const report = estimateCodexBenefit({ scan, plan, tokenizer: 'approx', priceTable: { schemaVersion: 1, name: 'empty', updatedAt: newTime, channel: 'api', serviceTier: 'standard', unit: 'USD/1M', prices: [] } });
    expect(report.savings.inputTokens).toBeGreaterThan(0);
    expect(report.scenarios[0].projected.status).toBe('unknown');
    expect(report.scenarios[0].savings).toBeUndefined();
  });

  it('keeps cached attribution within nonzero lower and upper bounds and cold-cache costs consistent', async () => {
    session('main', newTime, [catalog(skills), usage('r1')]);
    const { scan, plan, report: initial } = await analyze();
    const D = initial.historyAnalysis!.descriptionTokensPerResponse!;
    scan.selected[0].usage[0].usage = { inputTokens: D, cachedInputTokens: D, cacheWriteInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: D };
    const report = estimateCodexBenefit({ scan, plan, tokenizer: 'approx' });
    expect(report.historyAnalysis?.firstResponse?.cacheAttribution).toMatchObject({ lower: D, upper: D, cachedRead: D });
    const cold = report.scenarios.find((item) => item.id === 'cache-rebuild')!;
    expect(cold.projected.amount).toBe(cold.modelCosts![0].projected!.amount);
  });
});

describe('catalog text deletion', () => {
  it('expands roots, preserves shared roots, and removes unused roots from historical entries alone', () => {
    expect(catalogEntries(skills, 'skills_instructions')[0].sourcePath).toBe('/missing/plugin/skills/used/SKILL.md');
    expect(removeCatalogEntries(skills, 'skills_instructions', new Set(['plugin:unused']))).toContain('`r0`');
    expect(removeCatalogEntries(skills, 'skills_instructions', new Set(['plugin:used', 'plugin:unused']))).not.toContain('`r0`');
  });
  it('filters exact plugin IDs and removes an empty block; fixed-list deltas do not simulate candidate refill', () => {
    const text = '<recommended_plugins>\n' + Array.from({ length: 50 }, (_, i) => `- Plugin ${i} (p${i}@remote)`).join('\n') + '\n</recommended_plugins>';
    const partial = removeCatalogEntries(text, 'recommended_plugins', new Set(['p0@remote']));
    expect(catalogEntries(partial, 'recommended_plugins')).toHaveLength(49);
    expect(partial).not.toContain('p50@remote');
    expect(removeCatalogEntries(text, 'recommended_plugins', new Set(Array.from({ length: 50 }, (_, i) => `p${i}@remote`)))).toBe('');
  });
});
