import { createHash } from 'node:crypto';

import { getPlanFixedEstimate } from './optimizationPlan';
import type { OptimizationPlanValidation } from './optimizationPlan';
import { calculateBenefitCost, findBenefitPrice, DEFAULT_BENEFIT_PRICE_TABLE as DEFAULT_PRICES } from './prices';
import { buildBenefitPlanCoverage, planResources, reconstructHistoricalContext, responseMatchesPlan } from './contextEvidence';
import { projectHistory, userMainSessions } from './historyAnalysis';
import { createTokenCounter } from '../context/tokenCounter';
import type { ContextTokenizerMode } from '../types/context';
import type {
  BenefitCostMetrics,
  BenefitDiagnostic,
  BenefitEstimateStatus,
  BenefitModelCostBreakdown,
  BenefitPriceTable,
  BenefitReport,
  BenefitResponseEstimate,
  BenefitResourceContribution,
  BenefitSnapshotReference,
  BenefitScenario,
  BenefitUsageMetrics,
  CodexSessionScanResult,
  CodexSessionSelection,
  CodexUsage,
  OptimizationPlan,
} from './types';

interface EstimateBenefitOptions {
  scan: CodexSessionScanResult;
  plan?: OptimizationPlan;
  planDiagnostics?: BenefitDiagnostic[];
  priceTable?: BenefitPriceTable;
  timezone?: string;
  tokenizer?: ContextTokenizerMode;
  tokenizerModel?: string;
  planValidation?: OptimizationPlanValidation;
}

interface ScenarioUsage {
  before: CodexUsage;
  projected: CodexUsage;
}

interface ResponseEstimateOptions {
  evidence?: BenefitResponseEstimate['evidence'];
  inputSavings?: number;
  resourceMatches?: BenefitResponseEstimate['resourceMatches'];
  reason?: string;
}

function emptyUsage(): CodexUsage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
  };
}

function addUsage(left: CodexUsage, right: CodexUsage): CodexUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    cacheWriteInputTokens: left.cacheWriteInputTokens + right.cacheWriteInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    reasoningOutputTokens: left.reasoningOutputTokens + right.reasoningOutputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

function roundNonNegative(value: number): number {
  return Math.max(0, Math.round(value));
}

function percent(numerator: number, denominator: number): number | undefined {
  if (denominator <= 0) return undefined;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function withValidInputPartition(usage: CodexUsage, projectedInputTokens: number): CodexUsage {
  const cachedInputTokens = Math.min(projectedInputTokens, usage.cachedInputTokens);
  const cacheWriteInputTokens = Math.min(
    Math.max(0, projectedInputTokens - cachedInputTokens),
    usage.cacheWriteInputTokens,
  );
  return {
    ...usage,
    inputTokens: projectedInputTokens,
    cachedInputTokens,
    cacheWriteInputTokens,
    totalTokens: Math.max(0, usage.totalTokens - (usage.inputTokens - projectedInputTokens)),
  };
}

function toUsageMetrics(records: Array<{ usage: CodexUsage }>, coveredResponseCount: number, affectedResponseCount: number): BenefitUsageMetrics {
  const usage = records.reduce((sum, record) => addUsage(sum, record.usage), emptyUsage());
  return {
    ...usage,
    responseCount: records.length,
    coveredResponseCount,
    affectedResponseCount,
  };
}

function projectedUsage(
  usage: CodexUsage,
  rate: number,
): { projected: CodexUsage; savings?: number; status: BenefitEstimateStatus; reason?: string } {
  if (!Number.isFinite(rate) || rate > 1) {
    return { projected: usage, status: 'unknown', reason: 'Optimization estimate rate would make projected input negative' };
  }
  const savings = Math.round(usage.inputTokens * rate);
  const projectedInputTokens = usage.inputTokens - savings;
  if (projectedInputTokens < 0) {
    return { projected: usage, status: 'unknown', reason: 'Projected input savings exceeds observed input tokens' };
  }
  return {
    projected: withValidInputPartition(usage, projectedInputTokens),
    savings,
    status: 'estimated',
  };
}

function projectedUsageFromSavings(
  usage: CodexUsage,
  inputSavings: number,
): { projected: CodexUsage; savings?: number; status: BenefitEstimateStatus; reason?: string } {
  if (!Number.isFinite(inputSavings)) return { projected: usage, status: 'unknown', reason: 'Historical text difference was not finite' };
  const savings = Math.round(inputSavings);
  const projectedInputTokens = usage.inputTokens - savings;
  if (projectedInputTokens < 0) return { projected: usage, status: 'unknown', reason: 'Reconstructed context savings exceeds observed input tokens' };
  return {
    projected: subtractPersistentContext(usage, savings),
    savings,
    status: 'estimated',
  };
}

// A retained prompt prefix is charged on every response, even if transport sends
// only a delta. Its cache attribution is a scenario, not per-Skill telemetry.
function subtractPersistentContext(usage: CodexUsage, savings: number): CodexUsage {
  const cachedSavings = Math.min(savings, usage.cachedInputTokens);
  const writeSavings = Math.min(savings - cachedSavings, usage.cacheWriteInputTokens);
  return {
    ...usage,
    inputTokens: usage.inputTokens - savings,
    cachedInputTokens: usage.cachedInputTokens - cachedSavings,
    cacheWriteInputTokens: usage.cacheWriteInputTokens - writeSavings,
    totalTokens: usage.totalTokens - savings,
  };
}

function preserveCacheRatio(usage: CodexUsage, projectedInputTokens: number): CodexUsage {
  if (usage.inputTokens <= 0) return { ...usage, inputTokens: projectedInputTokens, totalTokens: Math.max(0, usage.totalTokens - (usage.inputTokens - projectedInputTokens)) };
  const ratio = projectedInputTokens / usage.inputTokens;
  const cached = Math.min(projectedInputTokens, roundNonNegative(usage.cachedInputTokens * ratio));
  const writes = Math.min(Math.max(0, projectedInputTokens - cached), roundNonNegative(usage.cacheWriteInputTokens * ratio));
  return {
    ...usage,
    inputTokens: projectedInputTokens,
    cachedInputTokens: cached,
    cacheWriteInputTokens: writes,
    totalTokens: Math.max(0, usage.totalTokens - (usage.inputTokens - projectedInputTokens)),
  };
}

function rebuildCache(usage: CodexUsage, projectedInputTokens: number, inputSavings: number): CodexUsage {
  const cached = inputSavings !== 0 ? 0 : Math.min(projectedInputTokens, usage.cachedInputTokens);
  const writes = Math.min(Math.max(0, projectedInputTokens - cached), usage.cacheWriteInputTokens);
  return {
    ...usage,
    inputTokens: projectedInputTokens,
    cachedInputTokens: cached,
    cacheWriteInputTokens: writes,
    totalTokens: Math.max(0, usage.totalTokens - (usage.inputTokens - projectedInputTokens)),
  };
}

function estimateResponse(
  record: CodexSessionSelection['usage'][number],
  rate: number | undefined,
  eligible = true,
  options: ResponseEstimateOptions = {},
): { response: BenefitResponseEstimate; usage?: ScenarioUsage } {
  if (record.quality !== 'complete') {
    return {
      response: {
        responseId: record.responseId,
        sessionId: record.sessionId,
        threadId: record.threadId,
        ...(record.turnId ? { turnId: record.turnId } : {}),
        timestamp: record.timestamp,
        ...(record.model ? { model: record.model } : {}),
        ...(record.effort ? { effort: record.effort } : {}),
        ...(record.usageValidation ? { usageValidation: record.usageValidation } : {}),
        evidence: options.evidence ?? 'unknown',
        ...(options.resourceMatches ? { resourceMatches: options.resourceMatches } : {}),
        ...(record.contextSnapshotLine !== undefined ? { contextSnapshotLine: record.contextSnapshotLine } : {}),
        before: record.usage,
        status: 'unknown',
        reason: 'Usage record is partial and is excluded from aggregate metrics',
        sourcePath: record.sourcePath,
        line: record.line,
      },
    };
  }
  if (rate === undefined && options.inputSavings === undefined) {
    return {
      response: {
        responseId: record.responseId,
        sessionId: record.sessionId,
        threadId: record.threadId,
        ...(record.turnId ? { turnId: record.turnId } : {}),
        timestamp: record.timestamp,
        ...(record.model ? { model: record.model } : {}),
        ...(record.effort ? { effort: record.effort } : {}),
        ...(record.usageValidation ? { usageValidation: record.usageValidation } : {}),
        evidence: options.evidence ?? 'unknown',
        ...(options.resourceMatches ? { resourceMatches: options.resourceMatches } : {}),
        ...(record.contextSnapshotLine !== undefined ? { contextSnapshotLine: record.contextSnapshotLine } : {}),
        before: record.usage,
        status: options.reason ? 'unknown' : 'not_applicable',
        reason: options.reason ?? 'No optimization plan with a usable static estimate was available',
        sourcePath: record.sourcePath,
        line: record.line,
      },
    };
  }
  if (!eligible) {
    return {
      response: {
        responseId: record.responseId,
        sessionId: record.sessionId,
        threadId: record.threadId,
        ...(record.turnId ? { turnId: record.turnId } : {}),
        timestamp: record.timestamp,
        ...(record.model ? { model: record.model } : {}),
        ...(record.effort ? { effort: record.effort } : {}),
        ...(record.usageValidation ? { usageValidation: record.usageValidation } : {}),
        evidence: options.evidence ?? 'unknown',
        ...(options.resourceMatches ? { resourceMatches: options.resourceMatches } : {}),
        ...(record.contextSnapshotLine !== undefined ? { contextSnapshotLine: record.contextSnapshotLine } : {}),
        before: record.usage,
        status: 'unknown',
        reason: options.reason ?? 'Historical context evidence did not cover this response',
        sourcePath: record.sourcePath,
        line: record.line,
      },
    };
  }
  const result = options.inputSavings !== undefined
    ? projectedUsageFromSavings(record.usage, options.inputSavings)
    : projectedUsage(record.usage, rate ?? 0);
  const response: BenefitResponseEstimate = {
    responseId: record.responseId,
    sessionId: record.sessionId,
    threadId: record.threadId,
    ...(record.turnId ? { turnId: record.turnId } : {}),
    timestamp: record.timestamp,
    ...(record.model ? { model: record.model } : {}),
    evidence: options.evidence ?? 'static-plan',
    ...(options.resourceMatches ? { resourceMatches: options.resourceMatches } : {}),
    ...(record.contextSnapshotLine !== undefined ? { contextSnapshotLine: record.contextSnapshotLine } : {}),
    before: record.usage,
    ...(result.status === 'estimated' ? { projectedAfter: result.projected } : {}),
    ...(result.savings !== undefined ? { estimatedInputSavings: result.savings } : {}),
    status: result.status,
    ...(result.reason ? { reason: result.reason } : {}),
    sourcePath: record.sourcePath,
    line: record.line,
  };
  return {
    response,
    ...(result.status === 'estimated' ? { usage: { before: record.usage, projected: result.projected } } : {}),
  };
}

function addScenarioCost(
  records: Array<{ record: CodexSessionSelection['usage'][number]; usage: ScenarioUsage }>,
  priceTable: BenefitPriceTable,
  projection: (usage: ScenarioUsage, index: number) => CodexUsage,
): { baseline: BenefitCostMetrics; projected: BenefitCostMetrics } {
  let baselineAmount = 0;
  let projectedAmount = 0;
  let currency: string | undefined;
  let pricedResponseCount = 0;
  let unpricedResponseCount = 0;
  for (const [index, item] of records.entries()) {
    const price = findBenefitPrice(item.record.model, priceTable);
    const before = calculateBenefitCost(item.usage.before, price);
    const projected = projection(item.usage, index);
    const after = calculateBenefitCost(projected, price);
    if (before.status !== 'estimated' || after.status !== 'estimated' || before.amount === undefined || after.amount === undefined) {
      unpricedResponseCount += 1;
    } else {
      if (currency && before.currency && currency !== before.currency) {
        unpricedResponseCount += 1;
      } else {
        baselineAmount += before.amount;
        projectedAmount += after.amount;
        currency ??= before.currency;
        pricedResponseCount += 1;
      }
    }
  }
  const partialReason = unpricedResponseCount > 0
    ? `${unpricedResponseCount} response(s) were excluded because model pricing or cache partition data was unavailable`
    : undefined;
  const baseline: BenefitCostMetrics = pricedResponseCount > 0
    ? { status: 'estimated', amount: baselineAmount, currency, priceModel: 'aggregate', ...(partialReason ? { reason: partialReason } : {}), ...(unpricedResponseCount > 0 ? { unpricedResponseCount } : {}) }
    : { status: 'unknown', ...(partialReason ? { reason: partialReason } : {}), ...(unpricedResponseCount > 0 ? { unpricedResponseCount } : {}) };
  const projected: BenefitCostMetrics = pricedResponseCount > 0
    ? { status: 'estimated', amount: projectedAmount, currency, priceModel: 'aggregate', ...(partialReason ? { reason: partialReason } : {}), ...(unpricedResponseCount > 0 ? { unpricedResponseCount } : {}) }
    : { status: 'unknown', ...(partialReason ? { reason: partialReason } : {}), ...(unpricedResponseCount > 0 ? { unpricedResponseCount } : {}) };
  return { baseline, projected };
}

function makeScenario(
  id: BenefitScenario['id'],
  label: string,
  assumption: string,
  records: Array<{ record: CodexSessionSelection['usage'][number]; usage: ScenarioUsage }>,
  priceTable: BenefitPriceTable,
  projection: (usage: ScenarioUsage, index: number) => CodexUsage,
  parameters?: Record<string, string | number | boolean | null>,
): BenefitScenario {
  const costs = addScenarioCost(records, priceTable, projection);
  const savings = costs.baseline.amount !== undefined && costs.projected.amount !== undefined
    ? costs.baseline.amount - costs.projected.amount
    : undefined;
  return {
    id,
    label,
    assumption,
    baseline: costs.baseline,
    projected: costs.projected,
    ...(savings !== undefined ? { savings, savingsPercent: percent(savings, costs.baseline.amount ?? 0) } : {}),
    ...(parameters ? { parameters } : {}),
    modelCosts: modelCostBreakdown(records.map((item, index) => ({ ...item, usage: { ...item.usage, projected: projection(item.usage, index) } })), priceTable).breakdown,
  };
}

function modelCostBreakdown(
  records: Array<{ record: CodexSessionSelection['usage'][number]; usage: ScenarioUsage }>,
  priceTable: BenefitPriceTable,
): { breakdown: BenefitModelCostBreakdown[]; pricedResponseCount: number; pricedInputTokens: number } {
  const groups = new Map<string, Array<{ record: CodexSessionSelection['usage'][number]; usage: ScenarioUsage }>>();
  for (const item of records) {
    const model = item.record.model ?? '(unknown model)';
    groups.set(model, [...(groups.get(model) ?? []), item]);
  }
  let pricedResponseCount = 0;
  let pricedInputTokens = 0;
  const breakdown = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([model, items]) => {
    let amountTotal = 0;
    let projectedAmountTotal = 0;
    let priced = 0;
    let unpriced = 0;
    let currency: string | undefined;
    for (const item of items) {
      const price = findBenefitPrice(item.record.model, priceTable);
      const cost = calculateBenefitCost(item.usage.before, price);
      const projectedCost = calculateBenefitCost(item.usage.projected, price);
      if (cost.status === 'estimated' && cost.amount !== undefined && projectedCost.status === 'estimated' && projectedCost.amount !== undefined && (!currency || !cost.currency || currency === cost.currency)) {
        amountTotal += cost.amount;
        projectedAmountTotal += projectedCost.amount;
        currency ??= cost.currency;
        priced += 1;
        pricedResponseCount += 1;
        pricedInputTokens += item.usage.before.inputTokens;
      } else {
        unpriced += 1;
      }
    }
    const reason = unpriced > 0 ? `${unpriced} response(s) were excluded because model pricing or cache partition data was unavailable` : undefined;
    const baseline: BenefitCostMetrics = priced > 0
      ? { status: 'estimated', amount: amountTotal, ...(currency ? { currency } : {}), priceModel: model, ...(reason ? { reason } : {}), ...(unpriced > 0 ? { unpricedResponseCount: unpriced } : {}) }
      : { status: 'unknown', priceModel: model, ...(reason ? { reason } : {}), ...(unpriced > 0 ? { unpricedResponseCount: unpriced } : {}) };
    const projected: BenefitCostMetrics = priced > 0
      ? { status: 'estimated', amount: projectedAmountTotal, ...(currency ? { currency } : {}), priceModel: model, ...(reason ? { reason } : {}), ...(unpriced > 0 ? { unpricedResponseCount: unpriced } : {}) }
      : { status: 'unknown', priceModel: model, ...(reason ? { reason } : {}), ...(unpriced > 0 ? { unpricedResponseCount: unpriced } : {}) };
    return {
      model,
      responseCount: items.length,
      pricedResponseCount: priced,
      baseline,
      projected,
      ...(priced > 0 ? { savings: amountTotal - projectedAmountTotal, savingsPercent: percent(amountTotal - projectedAmountTotal, amountTotal) } : {}),
    };
  });
  return { breakdown, pricedResponseCount, pricedInputTokens };
}

function sessionModel(selection: CodexSessionSelection): string | undefined {
  return selection.usage.find((record) => record.model)?.model;
}

function sessionReport(selection: CodexSessionSelection): BenefitReport['sessions'][number] {
  return {
    sessionId: selection.session.sessionId,
    threadId: selection.session.threadId,
    filePath: selection.session.filePath,
    ...(selection.session.cwd ? { cwd: selection.session.cwd } : {}),
    ...(selection.lastTimestamp ? { lastTimestamp: selection.lastTimestamp } : {}),
    ...(sessionModel(selection) ? { model: sessionModel(selection) } : {}),
    responseCount: selection.summary.responseCount,
    usage: selection.summary,
    events: selection.events,
    contextSnapshotCount: selection.associatedFiles.reduce((sum, analysis) => sum + analysis.contextSnapshots.length, 0),
    cwdCount: new Set(selection.associatedFiles.flatMap((analysis) => analysis.cwdCandidates)).size,
    status: selection.status,
    diagnostics: selection.diagnostics,
  };
}

function mergePlanDiagnostics(planDiagnostics: BenefitDiagnostic[] | undefined): BenefitDiagnostic[] {
  return planDiagnostics ? [...planDiagnostics] : [];
}

function textSha256(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function snapshotReference(snapshot: CodexSessionSelection['associatedFiles'][number]['contextSnapshots'][number]): BenefitSnapshotReference {
  return {
    timestamp: snapshot.timestamp,
    sourcePath: snapshot.sourcePath,
    line: snapshot.line,
    full: snapshot.full,
    recoverable: true,
    ...(snapshot.sourceKind ? { sourceKind: snapshot.sourceKind } : {}),
    ...(snapshot.role ? { role: snapshot.role } : {}),
    ...(snapshot.stateKeys ? { stateKeys: [...snapshot.stateKeys] } : {}),
    ...(snapshot.agentsTextChars !== undefined ? { agentsTextChars: snapshot.agentsTextChars } : {}),
    ...(textSha256(snapshot.agentsText) ? { agentsTextSha256: textSha256(snapshot.agentsText) } : {}),
    ...(snapshot.hostSkillsTextChars !== undefined ? { hostSkillsTextChars: snapshot.hostSkillsTextChars } : {}),
    ...(textSha256(snapshot.hostSkillsText) ? { hostSkillsTextSha256: textSha256(snapshot.hostSkillsText) } : {}),
    ...(snapshot.agentsTruncated !== undefined ? { agentsTruncated: snapshot.agentsTruncated } : {}),
    ...(snapshot.agentsComplete !== undefined ? { agentsComplete: snapshot.agentsComplete } : {}),
    ...(snapshot.hostSkillsTruncated !== undefined ? { hostSkillsTruncated: snapshot.hostSkillsTruncated } : {}),
    ...(snapshot.hostSkillsComplete !== undefined ? { hostSkillsComplete: snapshot.hostSkillsComplete } : {}),
    ...(snapshot.contextTextChars !== undefined ? { contextTextChars: snapshot.contextTextChars } : {}),
    ...(snapshot.contextTextSha256 ? { contextTextSha256: snapshot.contextTextSha256 } : {}),
    ...(snapshot.contextBlocksComplete !== undefined ? { contextBlocksComplete: snapshot.contextBlocksComplete } : {}),
    ...(snapshot.evidenceLevel ? { evidenceLevel: snapshot.evidenceLevel } : {}),
    ...(snapshot.contextBlocks ? {
      contextBlocks: snapshot.contextBlocks.map((block) => ({
        id: block.id,
        tag: block.tag,
        role: block.role,
        activation: block.activation,
        ...(block.contentKind ? { contentKind: block.contentKind } : {}),
        complete: block.complete,
        estimatedChars: block.estimatedChars,
        ...(block.estimatedTokens !== undefined ? { estimatedTokens: block.estimatedTokens } : {}),
        ...(block.textSha256 ? { textSha256: block.textSha256 } : {}),
        ...(block.controlMethod ? { controlMethod: block.controlMethod } : {}),
        ...(block.controllable !== undefined ? { controllable: block.controllable } : {}),
        ...(block.controlStatus ? { controlStatus: block.controlStatus } : {}),
        ...(block.evidenceLevel ? { evidenceLevel: block.evidenceLevel } : {}),
        ...(block.provenance ? { provenance: { ...block.provenance } } : {}),
        recommendation: block.recommendation,
        sourcePath: block.sourcePath,
        line: block.line,
      })),
    } : {}),
  };
}

function planNeedsInventoryValidation(plan: OptimizationPlan | undefined): boolean {
  if (!plan) return false;
  return (plan.sourceKind !== 'explicit' && plan.sourceKind !== 'offline')
    || Boolean(plan.inventoryFingerprint)
    || plan.kind?.startsWith('skill-doctor-context-') === true
    || Boolean(plan.snapshotId);
}

export function estimateCodexBenefit(options: EstimateBenefitOptions): BenefitReport {
  const priceTable = options.priceTable ?? DEFAULT_PRICES;
  const tokenCounter = createTokenCounter({ tokenizer: options.tokenizer, tokenizerModel: options.tokenizerModel, preserveWhitespace: true });
  const historyAnalysis = options.plan?.offlineHistory ? projectHistory(options.plan.offlineHistory, options.scan, tokenCounter.count) : undefined;
  if (historyAnalysis) {
    const selected = userMainSessions(options.scan).filter((item) => item.session.sessionId === historyAnalysis.baselineSession?.sessionId).map((item) => {
      historyAnalysis.childModelCosts = modelCostBreakdown(item.usage.filter((record) => record.threadId !== item.session.threadId && record.quality === 'complete').map((record) => ({ record, usage: { before: record.usage, projected: record.usage } })), priceTable).breakdown;
      const usage = item.usage.filter((record) => record.threadId === item.session.threadId);
      const summary = usage.filter((record) => record.quality === 'complete').reduce((sum, record) => ({ ...addUsage(sum, record.usage), responseCount: usage.length, completeResponseCount: sum.completeResponseCount + 1 }), { ...emptyUsage(), responseCount: usage.length, completeResponseCount: 0 });
      return { ...item, usage, summary, events: item.analysis.events, associatedFiles: [item.analysis] };
    });
    options = { ...options, scan: { ...options.scan, selected } };
  }
  const completeRecords = options.scan.selected.flatMap((selection) => selection.usage.filter((record) => record.quality === 'complete').map((record) => ({ selection, record })));
  const planEstimate = options.plan ? getPlanFixedEstimate(options.plan) : { reason: 'No optimization plan was available' };
  const planRate = planEstimate.rate !== undefined && Number.isFinite(planEstimate.rate) && planEstimate.rate <= 1
    ? planEstimate.rate
    : undefined;
  const basePlanCoverage = buildBenefitPlanCoverage(options.scan, options.plan);
  const hasResourceSelection = Boolean(historyAnalysis) || planResources(options.plan).length > 0;
  const requiresInventoryValidation = planNeedsInventoryValidation(options.plan);
  const planCoverage = {
    ...basePlanCoverage,
    inventoryStatus: requiresInventoryValidation
      ? options.planValidation?.status === 'matched'
        ? 'matched' as const
        : options.planValidation?.status === 'mismatch'
          ? 'mismatch' as const
          : 'unknown' as const
      : 'not_available' as const,
  };
  const inventoryValid = planCoverage.inventoryStatus === 'not_available' || planCoverage.inventoryStatus === 'matched';
  const rate = !hasResourceSelection && planRate !== undefined && inventoryValid && (planCoverage.status === 'static_only' || planCoverage.status === 'matched')
    ? planRate
    : undefined;
  const diagnostics = [
    ...options.scan.diagnostics,
    ...mergePlanDiagnostics(options.planDiagnostics),
  ];
  if (options.plan && rate === undefined && !hasResourceSelection) {
    diagnostics.push({
      code: planRate === undefined ? 'plan.estimate_unusable' : !inventoryValid ? 'plan.inventory_drift' : 'plan.historical_context_unmatched',
      severity: 'warning',
      message: !inventoryValid
        ? options.planValidation?.message ?? 'Current context inventory could not be verified against the optimization plan'
        : planRate === undefined
          ? planEstimate.reason ?? 'Optimization plan does not contain a usable static estimate'
          : `Historical context evidence is ${planCoverage.status}; the static plan estimate was not applied to avoid attributing unmatched resources`,
      sourcePath: options.plan.sourcePath,
    });
  }

  const resourceContributionTotals = new Map<string, BenefitResourceContribution>();
  const responseResults = completeRecords.map(({ selection, record }) => {
    if (historyAnalysis) {
      const row = historyAnalysis.responses.find((item) => item.responseId === record.responseId);
      return estimateResponse(record, undefined, row?.descriptionTokens !== undefined, { evidence: 'catalog-projection', inputSavings: row?.descriptionTokens, reason: row?.descriptionTokens === undefined ? 'Catalog or valid input partition unavailable; projection unknown.' : undefined });
    }
    const isMainThread = selection.session.threadId === record.threadId;
    const hasChildContext = selection.associatedFiles.some((analysis) => analysis.meta?.threadId === record.threadId && analysis.contextSnapshots.length > 0);
    const planMatch = options.plan
      ? responseMatchesPlan(options.plan, selection, record)
      : { matched: true, reason: undefined };
    const reconstructableResources = planMatch.matchedResources ?? [];
    const resourcesForReconstruction = reconstructableResources;
    const reconstruction = resourcesForReconstruction.length > 0 && planMatch.snapshot
      ? reconstructHistoricalContext(resourcesForReconstruction, planMatch.snapshot, tokenCounter, {
          inventory: options.plan?.items,
        })
      : undefined;
    const textReconstructed = reconstruction?.status === 'estimated';
    const allAlreadyOptimized = Boolean(
      planMatch.matches
      && planMatch.matches.length > 0
      && planMatch.matches.every((match) => match.status === 'matched' && match.historicalState === 'after'),
    );
    if (inventoryValid && textReconstructed && reconstruction && reconstruction.inputSavings! <= record.usage.inputTokens) {
      for (const contribution of reconstruction.contributions ?? []) {
        const current = resourceContributionTotals.get(contribution.resourceId) ?? { resourceId: contribution.resourceId, responseCount: 0, inputSavings: 0, interactionTokens: 0 };
        resourceContributionTotals.set(contribution.resourceId, { ...current, responseCount: current.responseCount + 1, inputSavings: current.inputSavings + contribution.inputSavings });
      }
      if (reconstruction.interactionTokens) {
        const current = resourceContributionTotals.get('(interaction)') ?? { resourceId: '(interaction)', responseCount: 0, inputSavings: 0, interactionTokens: 0 };
        resourceContributionTotals.set('(interaction)', { ...current, responseCount: current.responseCount + 1, interactionTokens: current.interactionTokens + reconstruction.interactionTokens });
      }
    }
    const contextEligible = planCoverage.status === 'matched'
      ? planMatch.matched
      : isMainThread || hasChildContext;
    const evidenceAllowed = inventoryValid;
    const eligible = evidenceAllowed && (textReconstructed || allAlreadyOptimized || (rate !== undefined && contextEligible && !planMatch.alreadyOptimized));
    const reason = rate === undefined && planRate !== undefined
      ? `Historical context evidence is ${planCoverage.status}; ${planMatch.reason ?? 'the planned resource was not matched for this response'}`
      : planMatch.reason;
    return estimateResponse(record, rate, eligible, {
      evidence: textReconstructed ? 'text-reconstructed' : allAlreadyOptimized ? 'already-optimized' : planCoverage.status === 'matched' && planMatch.matched ? 'historical-context' : planCoverage.status === 'static_only' ? 'static-plan' : 'unknown',
      ...(textReconstructed && reconstruction?.inputSavings !== undefined ? { inputSavings: reconstruction.inputSavings } : allAlreadyOptimized ? { inputSavings: 0 } : {}),
      ...(planMatch.matches ? { resourceMatches: planMatch.matches } : {}),
      ...(reason ? { reason } : {}),
    });
  });
  const responses = [
    ...options.scan.selected.flatMap((selection) => selection.usage.filter((record) => record.quality !== 'complete').map((record) => estimateResponse(record, rate).response)),
    ...responseResults.map((result) => result.response),
  ].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const scenarioRecords = completeRecords
    .map(({ record }, index) => {
      const result = responseResults[index];
      return result.usage ? { record, usage: result.usage } : undefined;
    })
    .filter((result): result is { record: CodexSessionSelection['usage'][number]; usage: ScenarioUsage } => Boolean(result));
  const baseline = toUsageMetrics(completeRecords.map(({ record }) => record), scenarioRecords.length, scenarioRecords.filter((item) => item.usage.before.inputTokens !== item.usage.projected.inputTokens).length);
  const projectedUsageRecords = completeRecords.map(({ record }, index) => ({ usage: responseResults[index].usage?.projected ?? record.usage }));
  const projected = toUsageMetrics(projectedUsageRecords, scenarioRecords.length, scenarioRecords.filter((item) => item.usage.before.inputTokens !== item.usage.projected.inputTokens).length);
  const scenarioCostRecords = completeRecords.map(({ record }, index) => ({
    record,
    usage: responseResults[index].usage ?? { before: record.usage, projected: record.usage },
  }));
  const inputSavings = baseline.inputTokens - projected.inputTokens;
  const totalSavings = baseline.totalTokens - projected.totalTokens;
  const selectedResponseCount = options.scan.selected.reduce((sum, selection) => sum + selection.usage.length, 0);
  const coverageResponsePercent = percent(scenarioRecords.length, selectedResponseCount) ?? 0;
  const completeUsagePercent = percent(baseline.responseCount, selectedResponseCount) ?? 0;
  const firstResponses = 1;
  const rebuildIndices = new Set(scenarioCostRecords.flatMap((item, index) => item.usage.before.inputTokens !== item.usage.projected.inputTokens ? [index] : []).slice(0, firstResponses));
  const scenarios = rate === undefined && scenarioRecords.length === 0
    ? []
    : [
        ...(hasResourceSelection ? [makeScenario('persistent-context', '持续上下文扣减（推荐）', '每条仍含该 Skill 描述的响应都扣除文本差额，不按 WebSocket 增量字节计数。假设精简片段优先属于已缓存前缀：扣减不超过实测缓存读取量，其次缓存写入，剩余为普通输入；无缓存的首轮按普通输入计。仅为模拟，不证明逐 Skill 缓存命中。', scenarioCostRecords, priceTable, (usage) => usage.projected, { cacheRule: 'cached-prefix-first-capped-by-observed-usage', affectedResponseRange: 'all-covered-responses' })] : []),
        makeScenario('historical-cache', '历史缓存比例延续', '假设优化后普通输入、缓存读取和缓存写入按输入缩放比例延续；输出与推理保持不变。', scenarioCostRecords, priceTable, (usage) => preserveCacheRatio(usage.before, usage.projected.inputTokens), { cacheRule: 'scale-all-input-components', firstResponses: null, affectedResponseRange: 'all-covered-responses' }),
        makeScenario('cache-rebuild', '缓存重建敏感性', `假设前 ${firstResponses} 条受影响响应完全失去缓存读取，保留有记录的缓存写入，后续响应延续历史缓存比例；这是修改前缀后的冷缓存敏感性场景，费用可能增加。`, scenarioCostRecords, priceTable, (usage, index) => {
          const delta = usage.before.inputTokens - usage.projected.inputTokens;
          return rebuildIndices.has(index) ? rebuildCache(usage.before, usage.projected.inputTokens, delta) : preserveCacheRatio(usage.before, usage.projected.inputTokens);
        }, { cacheRule: 'first-K-cold-then-preserve-ratio', firstResponses, affectedResponseRange: 'all-covered-responses' }),
      ];
  if (historyAnalysis) {
    const replayRecords = completeRecords.flatMap(({ record }) => {
      const delta = historyAnalysis.responses.find((row) => row.responseId === record.responseId)?.replayTokens;
      if (delta === undefined) return [];
      const result = projectedUsageFromSavings(record.usage, delta);
      return result.status === 'estimated' ? [{ record, usage: { before: record.usage, projected: result.projected } }] : [];
    });
    scenarios.push(makeScenario('historical-replay', '历史可重建回放（独立场景）', '仅对当时完整、可定位的目录扣除推荐集合中当时存在的描述；未知响应排除，不能把该子集当作完整会话收益。', replayRecords, priceTable, (usage) => usage.projected, { coveredResponses: replayRecords.length, unknownResponses: historyAnalysis.historicalReplay.unknownResponses }));
  }
  const costRecords = scenarioCostRecords;
  const modelCost = modelCostBreakdown(costRecords, priceTable);
  const textReconstructedResponses = responseResults.filter((result) => result.response.status === 'estimated' && result.response.evidence === 'text-reconstructed');
  const alreadyOptimizedResponseCount = responseResults.filter((result) => result.response.evidence === 'already-optimized').length;
  const textReconstructedSavingsTokens = textReconstructedResponses.reduce((sum, result) => sum + (result.response.estimatedInputSavings ?? 0), 0);
  const hasProjectedComparison = rate !== undefined || scenarioRecords.length > 0;

  if (historyAnalysis) {
    diagnostics.push({ code: 'estimate.latest_catalog_projection', severity: 'info', message: historyAnalysis.assumption });
  } else if (options.plan && hasResourceSelection) {
    diagnostics.push({ code: 'estimate.historical_context_required', severity: 'info', message: 'Resource-selected plans are simulated only from matched historical context text; unmatched responses remain unchanged' });
  } else if (options.plan) {
    diagnostics.push({ code: 'estimate.proportional_context_model', severity: 'info', message: 'Projected input savings use the optimizer static estimate as a proportional rate over covered historical input; Codex was not re-executed' });
  }
  const limitations = [
    'This report uses historical session usage and does not re-run Codex.',
    'Retained Skill descriptions are removed once per covered response, not once per network transfer. Cache attribution is hypothetical; WebSocket context retention is not proof of a cache hit.',
    'Retained recommended_plugins descriptions are counted per covered response, not once per log anchor.',
    'Text deltas preserve whitespace and use the selected tokenizer as an approximation; loaded Skill bodies and downstream behavior changes are not automatically removed.',
    'Projected output, reasoning, tool calls, retries, compactions, quality, and latency are held constant rather than predicted.',
    'A Skill is not an isolated billing unit; prompt context, cache behavior, tools, and sub-agents can change together.',
    'Cost is an equivalent API estimate when the price table matches the model; it is not a ChatGPT/Codex subscription bill.',
  ];
  if (options.plan?.sourceKind === 'offline') {
    limitations.push('Offline results project latest-catalog deletion onto one baseline workload. Unknown controls remain hypothetical candidates; review recommendations before disabling. Historical replay is reported separately, with unknown gaps.');
    limitations.push('Plugin controls are configuration-only, not host-runtime-verified. Per-ID recommendation removal may refill from unseen candidates; whole-block disable also removes installation suggestions. No configuration changed.');
  } else if (!options.plan) {
    limitations.push('No matching Skill Doctor optimization plan was found, so projected savings are unavailable.');
  }
  if (responses.some((response) => response.status === 'unknown')) limitations.push('Partial usage records are shown but excluded from aggregate metrics.');
  if (scenarios.some((scenario) => scenario.projected.status === 'unknown')) limitations.push('At least one model has no complete price entry, so cost totals are incomplete.');
  if (planResources(options.plan).some((resource) => resource.requiresNewSession)) limitations.push('The selected resource plan marks one or more changes as requiring a new Codex session; historical state evidence is used instead of apply time.');

  const selectionCount = options.scan.selected.reduce((sum, selection) => sum + selection.associatedFiles.length, 0);
  const historicalSnapshots = options.scan.selected.flatMap((selection) => selection.associatedFiles.flatMap((analysis) => analysis.contextSnapshots));
  const historicalSnapshotReferences = [...new Map(
    historicalSnapshots.map((snapshot) => [`${snapshot.sourcePath}:${snapshot.line}`, snapshotReference(snapshot)]),
  ).values()];
  const historicalTextSnapshots = historicalSnapshots.filter((snapshot) => snapshot.agentsText || snapshot.hostSkillsText);
  const historicalTextTokenCount = historicalTextSnapshots.reduce(
    (sum, snapshot) => sum + (snapshot.agentsText ? tokenCounter.count(snapshot.agentsText) : 0) + (snapshot.hostSkillsText ? tokenCounter.count(snapshot.hostSkillsText) : 0),
    0,
  );
  const historicalContextBlocks = historicalSnapshots.flatMap((snapshot) => snapshot.contextBlocks ?? []);
  const historicalContextBlockKinds = historicalContextBlocks.reduce<Record<string, number>>((counts, block) => {
    counts[block.id] = (counts[block.id] ?? 0) + 1;
    return counts;
  }, {});
  const historicalContextBlockTokenCount = historicalContextBlocks.reduce(
    (sum, block) => sum + (block.text ? tokenCounter.count(block.text) : block.estimatedTokens ?? 0),
    0,
  );
  const allWindowInputTokens = options.scan.selected.reduce(
    (sum, selection) => sum + selection.usage.reduce((inner, record) => inner + record.usage.inputTokens, 0),
    0,
  );
  return {
    schemaVersion: 1,
    kind: 'skill-doctor-codex-benefit-report',
    ...(historyAnalysis ? { historyAnalysis } : {}),
    generatedAt: new Date().toISOString(),
    projectDir: options.scan.projectDir,
    codexHome: options.scan.codexHome,
    window: {
      since: new Date(options.scan.sinceMs).toISOString(),
      until: new Date(options.scan.untilMs).toISOString(),
      timezone: options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    selection: {
      requestedLimit: options.scan.requestedLimit,
      selectedSessions: options.scan.selected.length,
      selectedResponseCount: options.scan.selected.reduce((sum, selection) => sum + selection.summary.responseCount, 0),
      associatedFileCount: selectionCount,
      includeArchived: options.scan.sessionRoots.some((root) => root.endsWith('archived_sessions')),
    },
    ...(options.plan ? {
      plan: {
        id: options.plan.id,
        sourcePath: options.plan.sourcePath,
        sourceKind: options.plan.sourceKind,
        ...(options.plan.status
          ? { status: options.plan.status }
          : options.plan.sourceKind === 'offline'
            ? { status: 'offline' }
            : options.plan.sourceKind === 'operation'
              ? { status: 'applied' }
              : { status: 'preview' }),
        ...(options.plan.createdAt ? { createdAt: options.plan.createdAt } : {}),
        ...(options.plan.projectDir ? { projectDir: options.plan.projectDir } : {}),
        ...(options.plan.snapshotId ? { snapshotId: options.plan.snapshotId } : {}),
        ...(options.plan.inventoryFingerprint ? { inventoryFingerprint: options.plan.inventoryFingerprint } : {}),
        ...(options.plan.operations ? { operationCount: options.plan.operations.length } : {}),
        ...(planResources(options.plan).length > 0 ? { resources: planResources(options.plan) } : {}),
        ...(options.plan.estimate ? { estimate: options.plan.estimate } : {}),
        ...(options.plan.offline ? { offline: options.plan.offline } : {}),
      },
    } : {}),
    planCoverage: { ...planCoverage, alreadyOptimizedResponseCount },
    adapter: options.scan.adapter,
    scanCounts: options.scan.counts,
    index: options.scan.index,
    ...(options.scan.timings ? { scanTimings: options.scan.timings } : {}),
    priceTable,
    baseline,
    projected,
    savings: {
      ...(hasProjectedComparison ? { inputTokens: inputSavings, inputTokenPercent: percent(inputSavings, baseline.inputTokens), totalTokens: totalSavings, totalTokenPercent: percent(totalSavings, baseline.totalTokens) } : {}),
      status: hasProjectedComparison ? 'estimated' : options.plan ? 'unknown' : 'not_applicable',
    },
    scenarios,
    modelCosts: modelCost.breakdown,
    costCoverage: {
      pricedResponseCount: modelCost.pricedResponseCount,
      unpricedResponseCount: Math.max(0, completeRecords.length - modelCost.pricedResponseCount),
      pricedInputTokens: modelCost.pricedInputTokens,
      totalInputTokens: baseline.inputTokens,
      responsePercent: percent(modelCost.pricedResponseCount, completeRecords.length) ?? 0,
      inputTokenPercent: percent(modelCost.pricedInputTokens, baseline.inputTokens) ?? 0,
    },
    sessions: options.scan.selected.map(sessionReport),
    responses,
    resourceContributions: [...resourceContributionTotals.values()].sort((left, right) => right.inputSavings - left.inputSavings),
    coverage: {
      responsePercent: coverageResponsePercent,
      inputTokenPercent: percent(scenarioRecords.reduce((sum, item) => sum + item.usage.before.inputTokens, 0), allWindowInputTokens) ?? 0,
      affectedResponsePercent: percent(baseline.affectedResponseCount, baseline.responseCount) ?? 0,
      completeUsagePercent,
    },
    simulation: {
      method: historyAnalysis ? 'latest-catalog-projection' : hasResourceSelection ? 'historical-context-text-diff' : 'proportional-static-estimate',
      source: options.plan?.sourceKind === 'offline' ? 'offline-context' : 'skill-doctor-plan',
      tokenizer: tokenCounter.summary,
      outputHeldConstant: true,
      reexecutedCodex: false,
      cacheScenarioIds: scenarios.map((scenario) => scenario.id),
    },
    evidence: {
      historicalContextSnapshotCount: historicalSnapshots.length,
      historicalTextSnapshotCount: historicalTextSnapshots.length,
      historicalTextTokenCount,
      historicalContextBlockCount: historicalContextBlocks.length,
      historicalContextBlockKinds,
      historicalContextBlockTokenCounts: historicalContextBlocks.reduce<Record<string, number>>((counts, block) => {
        counts[block.id] = (counts[block.id] ?? 0) + (block.text ? tokenCounter.count(block.text) : block.estimatedTokens ?? 0);
        return counts;
      }, {}),
      historicalContextBlockTokenCount,
      textReconstructedResponseCount: textReconstructedResponses.length,
      textReconstructedSavingsTokens,
      tokenizer: tokenCounter.summary,
      dynamicResourceTextReconstructed: textReconstructedResponses.length > 0,
      planEstimateEvidence: options.plan?.sourceKind === 'offline'
        ? 'offline-context-reconstruction'
        : options.plan
          ? 'static-optimizer-estimate'
          : 'none',
    },
    provenance: {
      sampleResponseIds: completeRecords.map(({ record }) => record.responseId),
      readBoundaries: options.scan.readBoundaries ?? [],
      contextSnapshots: historicalSnapshotReferences,
    },
    diagnostics,
    limitations,
  };
}

export function defaultBenefitPriceTable(): BenefitPriceTable {
  return DEFAULT_PRICES;
}
