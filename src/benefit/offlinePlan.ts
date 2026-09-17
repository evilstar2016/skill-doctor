import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

import { estimateContextCost } from '../context/estimateContextCost';
import { scanCodexContextEntries } from '../context/scanCodexContext';
import { createTokenCounter } from '../context/tokenCounter';
import type { ContextTokenizerMode } from '../types/context';
import { collectHistoryInput, removeCatalogEntries } from './historyAnalysis';
import type { BenefitDiagnostic, CodexSessionScanResult, OfflineDescriptionEstimate, OptimizationPlan, OptimizationPlanResource } from './types';

export interface BuildOfflineCodexPlanOptions {
  scan: CodexSessionScanResult;
  projectDir: string;
  homeDir?: string;
  codexHome?: string;
  tokenizer?: ContextTokenizerMode;
  tokenizerModel?: string;
  signal?: AbortSignal;
}

export interface OfflinePlanResult {
  plan: OptimizationPlan;
  diagnostics: BenefitDiagnostic[];
}

export async function buildOfflineCodexPlan(options: BuildOfflineCodexPlanOptions): Promise<OfflinePlanResult> {
  const history = await collectHistoryInput(options.scan, options.signal);
  const count = createTokenCounter({ tokenizer: options.tokenizer, tokenizerModel: options.tokenizerModel, preserveWhitespace: true }).count;
  const diagnostics: BenefitDiagnostic[] = [{ code: 'offline.mode', severity: 'info', message: 'Read-only latest-catalog projection and historical replay; no configuration changed and no host runtime disable verification performed.' }];
  const inventory: OptimizationPlanResource[] = [];
  for (const resource of ['skill', 'plugin'] as const) {
    try {
      const entries = await scanCodexContextEntries(options.projectDir, { homeDir: options.homeDir, codexHome: options.codexHome, resource, includeDisabled: true, discoverMcpTools: false });
      const result = estimateContextCost(entries, { projectPath: options.projectDir, scope: 'all', tokenizer: options.tokenizer, tokenizerModel: options.tokenizerModel });
      for (const item of [...result.items, ...(result.disabledItems ?? [])]) {
        if (item.kind !== 'agent-skill-description') continue;
        inventory.push({ id: item.id, name: item.name, sourcePath: item.sourcePath, resource: item.resource, kind: item.kind, enabled: item.enabled, controllable: item.controllable, controlMethod: item.controlMethod, controlStatus: item.controlStatus });
      }
    } catch (error) {
      diagnostics.push({ code: 'offline.inventory_scan_failed', severity: 'warning', message: String(error) });
    }
  }
  const profile = history.analysis.usageProfile;
  const affectedItems: OptimizationPlanResource[] = [];
  for (const candidate of profile) {
    if (candidate.kind === 'recommended_plugins') {
      candidate.control = 'config-only';
      candidate.controlStatus = 'configured';
      candidate.runtimeVerified = false;
      candidate.controlMethod = 'config-only: tool_suggest.disabled_tools (type=plugin, exact id); merge existing entries';
    } else {
      const matches = inventory.filter((item) => candidate.sourcePath ? item.sourcePath === candidate.sourcePath : item.name === candidate.name);
      const match = matches.length === 1 ? matches[0] : undefined;
      const pluginPath = candidate.sourcePath?.includes('/plugins/cache/');
      if (match?.enabled === false) {
        candidate.control = 'already-disabled';
        candidate.controlStatus = 'configured';
        candidate.runtimeVerified = false;
      } else if (match?.controllable !== false && match && !pluginPath) {
        candidate.control = 'config-only';
        candidate.controlStatus = 'configured';
        candidate.runtimeVerified = false;
      } else if (candidate.sourcePath && existsSync(candidate.sourcePath) && !pluginPath && !candidate.sourcePath.includes('/.system/')) {
        candidate.control = 'config-only';
        candidate.controlStatus = 'configured';
        candidate.runtimeVerified = false;
      } else {
        candidate.controlStatus = 'unknown';
        candidate.runtimeVerified = false;
      }
      candidate.controlMethod = candidate.control === 'unverified'
        ? 'Verify per-skill control for this source. Whole-plugin disable requires sibling Skill/tool dependency review; no automatic action.'
        : 'config-only: skills.config path=absolute SKILL.md, enabled=false (new session)';
    }
    if (candidate.recommendation !== 'review-disable') continue;
    affectedItems.push({ id: `${candidate.kind}:${candidate.id}`, name: candidate.name, sourcePath: candidate.sourcePath, resource: candidate.kind === 'recommended_plugins' ? 'plugin' : 'skill', kind: candidate.kind === 'recommended_plugins' ? 'context-block' : 'agent-skill-description', blockId: candidate.kind, enabled: false, controllable: candidate.control !== 'unverified', controlMethod: candidate.controlMethod, controlStatus: candidate.controlStatus ?? 'unknown', requiresNewSession: true });
  }
  const estimate = (kind: 'skills_instructions' | 'recommended_plugins'): OfflineDescriptionEstimate => {
    const candidates = profile.filter((item) => item.kind === kind);
    const text = history.catalogs.find((item) => item.source.kind === kind)?.text ?? '';
    const selected = candidates.filter((item) => item.recommendation === 'review-disable');
    // Source support is not host runtime verification; keep legacy verified fields at zero.
    return { candidateCount: candidates.length, explicitlyReferencedCount: candidates.filter((item) => item.recommendation === 'retain').length, verifiedRemovableCount: 0, verifiedRemovableTokens: 0, unverifiedPotentialCount: selected.length, unverifiedPotentialTokens: Math.max(0, count(text) - count(removeCatalogEntries(text, kind, new Set(selected.map((item) => item.id))))), blockTokens: count(text), entryTokens: Math.max(0, count(text) - count(removeCatalogEntries(text, kind, new Set(candidates.map((item) => item.id))))), controlStatus: 'configured-only' };
  };
  const skippedCandidates = profile.filter((item) => item.recommendation !== 'review-disable').map((item) => ({ source: item.kind, name: item.name, reason: item.reason }));
  const plan: OptimizationPlan = {
    schemaVersion: 1, kind: 'skill-doctor-offline-codex-plan', id: 'offline-codex-context', projectDir: resolve(options.projectDir), platform: 'codex', scope: 'all', status: 'offline',
    items: inventory, operations: [{ id: 'offline-description-simulation', type: 'disable', affectedItems }],
    offline: { historicalSkillCandidateCount: profile.filter((item) => item.kind === 'skills_instructions').length, selectedSkillCount: profile.filter((item) => item.kind === 'skills_instructions' && item.recommendation === 'review-disable').length, recommendedPluginCount: profile.filter((item) => item.kind === 'recommended_plugins').length, skippedCandidateCount: skippedCandidates.length, skippedCandidates, observedBlocks: Object.fromEntries(history.catalogs.map(({ source, text }) => [source.kind, { occurrences: 1, estimatedTokens: count(text) }])), descriptionEstimates: { skillsInstructions: estimate('skills_instructions'), recommendedPlugins: estimate('recommended_plugins') } },
    offlineHistory: history, sourcePath: 'offline://codex-context', sourceKind: 'offline',
  };
  if (!history.catalogs.length) diagnostics.push({ code: 'offline.no_catalog', severity: 'warning', message: 'Latest active main session has no complete catalog; projection is unknown.' });
  if (history.analysis.historyCoverage.incompleteFiles) diagnostics.push({ code: 'offline.incomplete_history', severity: 'warning', message: 'Unreadable or truncated history exists; absence of use is unknown and candidates are retained.' });
  return { plan, diagnostics };
}
