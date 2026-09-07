import type { BenefitReport } from '../benefit/types';

function formatNumber(value: number | undefined): string {
  return value === undefined ? '—' : new Intl.NumberFormat('zh-CN').format(value);
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? '—' : `${value.toFixed(2)}%`;
}

function formatCost(value: number | undefined, currency = 'USD'): string {
  return value === undefined ? '—' : `${currency} ${value.toFixed(6)}`;
}

function statusLabel(status: BenefitReport['savings']['status']): string {
  if (status === 'estimated') return '预计';
  if (status === 'unknown') return '证据不足';
  return '不适用';
}

function evidenceLabel(evidence: BenefitReport['responses'][number]['evidence']): string {
  if (evidence === 'text-reconstructed') return '文本可重建';
  if (evidence === 'already-optimized') return '历史已处于目标状态';
  if (evidence === 'historical-context') return '历史上下文匹配';
  if (evidence === 'static-plan') return '方案静态估算';
  return '不可估';
}

export function renderBenefitReport(report: BenefitReport): string {
  const lines = [
    'Codex 优化收益预估',
    '',
    `项目: ${report.projectDir}`,
    `窗口: ${report.window.since} 至 ${report.window.until} (${report.window.timezone})`,
    `会话: ${report.selection.selectedSessions} 个主会话 / ${report.selection.selectedResponseCount} 条响应 / ${report.selection.associatedFileCount} 个关联文件`,
    `读取: ${report.adapter.id}@${report.adapter.version}，发现 ${report.scanCounts.discoveredFiles} 个文件，跳过 ${report.scanCounts.skippedFiles} 个；索引命中 ${report.index.cacheHits} 个，增量 ${report.index.incrementalFiles} 个，重建 ${report.index.rebuiltFiles} 个`,
    ...(report.scanTimings ? [`性能: 总计 ${report.scanTimings.totalMs}ms，发现 ${report.scanTimings.discoveryMs}ms，解析 ${report.scanTimings.parseMs}ms，关联 ${report.scanTimings.selectionMs}ms${report.scanTimings.peakRssBytes === undefined ? '' : `，峰值 RSS ${formatNumber(report.scanTimings.peakRssBytes)} bytes`}`] : []),
    `跳过原因: ${Object.entries(report.scanCounts.skippedByReason).map(([reason, count]) => `${reason}=${count}`).join('，') || '无'}`,
    `方案: ${report.plan ? `${report.plan.id} (${report.plan.status ?? report.plan.sourceKind})` : '未找到 Skill Doctor 优化方案'}`,
    `方案证据: ${report.planCoverage.status}，资源快照校验 ${report.planCoverage.inventoryStatus}，历史快照 ${report.planCoverage.historicalSnapshotCount} 个，资源匹配 ${report.planCoverage.matchedResourceCount}/${report.planCoverage.resources.length}，已处于目标状态的资源/响应 ${report.planCoverage.alreadyOptimizedResourceCount}/${report.planCoverage.alreadyOptimizedResponseCount}`,
    `价格表: ${report.priceTable.name} (${report.priceTable.updatedAt})，等价 API 费用估算`,
    '',
    '核心指标（基于历史会话模拟，未重新执行 Codex）:',
    `  输入 Token 节省: ${formatNumber(report.savings.inputTokens)} (${formatPercent(report.savings.inputTokenPercent)})`,
    `  总 Token 节省: ${formatNumber(report.savings.totalTokens)} (${formatPercent(report.savings.totalTokenPercent)})`,
    `  状态: ${statusLabel(report.savings.status)}`,
    `  响应覆盖率: ${formatPercent(report.coverage.responsePercent)}`,
    `  输入用量完整率: ${formatPercent(report.coverage.completeUsagePercent)}`,
    `  费用可计价覆盖率: ${formatPercent(report.costCoverage.responsePercent)} 响应 / ${formatPercent(report.costCoverage.inputTokenPercent)} 输入 Token`,
    `  证据: 历史上下文快照 ${formatNumber(report.evidence.historicalContextSnapshotCount)} 个，含文本 ${formatNumber(report.evidence.historicalTextSnapshotCount)} 个（${formatNumber(report.evidence.historicalTextTokenCount)} Token）；文本重建响应 ${formatNumber(report.evidence.textReconstructedResponseCount)} 条，方案来源 ${report.evidence.planEstimateEvidence === 'static-optimizer-estimate' ? 'Optimizer 静态估算' : '无'}`,
    `  Tokenizer: ${report.evidence.tokenizer.mode}${report.evidence.tokenizer.model ? `，model=${report.evidence.tokenizer.model}` : ''}${report.evidence.tokenizer.encoding ? `，encoding=${report.evidence.tokenizer.encoding}` : ''}${report.evidence.tokenizer.fallback ? '，fallback=true' : ''}`,
    '',
    `基线输入/输出/总量: ${formatNumber(report.baseline.inputTokens)} / ${formatNumber(report.baseline.outputTokens)} / ${formatNumber(report.baseline.totalTokens)}`,
    `预计输入/输出/总量: ${formatNumber(report.projected.inputTokens)} / ${formatNumber(report.projected.outputTokens)} / ${formatNumber(report.projected.totalTokens)}`,
  ];

  if (report.scenarios.length > 0) {
    lines.push('', '模型费用情景（等价 API 费用估算，不是订阅账单）:');
    for (const scenario of report.scenarios) {
      const currency = scenario.baseline.currency ?? scenario.projected.currency ?? 'USD';
      lines.push(`  ${scenario.label}: ${formatCost(scenario.baseline.amount, currency)} -> ${formatCost(scenario.projected.amount, currency)}，节省 ${formatCost(scenario.savings, currency)} (${formatPercent(scenario.savingsPercent)})${scenario.baseline.reason ? `；${scenario.baseline.reason}` : ''}`);
      lines.push(`    假设: ${scenario.assumption}`);
      if (scenario.parameters) lines.push(`    参数: ${Object.entries(scenario.parameters).map(([key, value]) => `${key}=${value ?? 'null'}`).join('，')}`);
    }
  }

  if (report.modelCosts.length > 0) {
    lines.push('', '按模型费用情景:');
    for (const model of report.modelCosts) {
      lines.push(`  ${model.model}: ${model.responseCount} 条响应，已计价 ${model.pricedResponseCount} 条，${formatCost(model.baseline.amount, model.baseline.currency ?? 'USD')} -> ${formatCost(model.projected?.amount, model.projected?.currency ?? model.baseline.currency ?? 'USD')}（${statusLabel(model.baseline.status)}）${model.baseline.reason ? `；${model.baseline.reason}` : ''}`);
    }
  }

  if (report.resourceContributions.length > 0) {
    lines.push('', '可重建文本的资源贡献:');
    for (const contribution of report.resourceContributions) {
      lines.push(`  ${contribution.resourceId}: ${formatNumber(contribution.inputSavings)} Token，覆盖 ${contribution.responseCount} 条响应，交互差异 ${formatNumber(contribution.interactionTokens)} Token`);
    }
  }

  if (report.diagnostics.length > 0) {
    lines.push('', '诊断:');
    for (const item of report.diagnostics.slice(0, 12)) lines.push(`  [${item.severity}] ${item.code}: ${item.message}`);
    if (report.diagnostics.length > 12) lines.push(`  …另有 ${report.diagnostics.length - 12} 条诊断，JSON 报告包含完整内容`);
  }

  lines.push('', '限制:');
  for (const limitation of report.limitations) lines.push(`  - ${limitation}`);
  return lines.join('\n');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function redactValue(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (key === 'projectDir' || key === 'codexHome' || key === 'sourcePath' || key === 'filePath' || key === 'path' || key === 'cwd' || key === 'resourceId') return '[redacted]';
  if (key === 'message' && typeof value === 'string') return value.replace(/\/(?:Users|home|private|tmp)\/[^\s"'`]+/g, '[redacted]').replace(/[A-Za-z]:\\[^\s"'`]+/g, '[redacted]');
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redactValue(childValue, childKey)]));
}

export function redactBenefitReport(report: BenefitReport): BenefitReport {
  return redactValue(report) as BenefitReport;
}

export function renderBenefitHtml(report: BenefitReport, options: { redact?: boolean } = {}): string {
  const value = options.redact === false ? report : redactBenefitReport(report);
  const rows = value.responses.slice(0, 200).map((response) => `<tr><td>${escapeHtml(response.responseId)}</td><td>${escapeHtml(response.model ?? 'unknown')}</td><td>${escapeHtml(evidenceLabel(response.evidence))}</td><td>${escapeHtml(response.status)}</td><td>${escapeHtml(formatNumber(response.before.inputTokens))}</td><td>${escapeHtml(formatNumber(response.estimatedInputSavings))}</td></tr>`).join('');
  const scenarioRows = value.scenarios.map((scenario) => `<tr><td>${escapeHtml(scenario.label)}</td><td>${escapeHtml(formatCost(scenario.baseline.amount, scenario.baseline.currency ?? 'USD'))}</td><td>${escapeHtml(formatCost(scenario.projected.amount, scenario.projected.currency ?? scenario.baseline.currency ?? 'USD'))}</td><td>${escapeHtml(formatCost(scenario.savings, scenario.baseline.currency ?? 'USD'))}</td><td>${escapeHtml(scenario.baseline.reason ?? '')}</td></tr>`).join('');
  const modelRows = value.modelCosts.map((model) => `<tr><td>${escapeHtml(model.model)}</td><td>${model.pricedResponseCount}/${model.responseCount}</td><td>${escapeHtml(formatCost(model.baseline.amount, model.baseline.currency ?? 'USD'))}</td><td>${escapeHtml(formatCost(model.projected?.amount, model.projected?.currency ?? model.baseline.currency ?? 'USD'))}</td><td>${escapeHtml(model.baseline.reason ?? '')}</td></tr>`).join('');
  const costSummary = scenarioRows || modelRows ? `<h2>费用情景</h2>${scenarioRows ? '<h3>缓存情景</h3><table><thead><tr><th>情景</th><th>基线</th><th>预计</th><th>节省</th><th>说明</th></tr></thead><tbody>' + scenarioRows + '</tbody></table>' : ''}${modelRows ? '<h3>按模型</h3><table><thead><tr><th>模型</th><th>已计价</th><th>基线</th><th>预计</th><th>说明</th></tr></thead><tbody>' + modelRows + '</tbody></table>' : ''}` : '';
  const title = escapeHtml('Codex 优化收益预估');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font:14px system-ui,sans-serif;max-width:1100px;margin:32px auto;padding:0 20px;color:#17202a}h1{margin-bottom:4px}small,.muted{color:#5d6b78}.cards{display:flex;gap:12px;flex-wrap:wrap}.card{border:1px solid #d8e0e7;border-radius:10px;padding:12px 16px;min-width:170px}.value{font-size:24px;font-weight:700;display:block}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border-bottom:1px solid #e5e9ee;text-align:left;padding:8px}th{background:#f5f7f9}.notice{background:#fff6d8;padding:12px;border-radius:8px;margin:16px 0;white-space:pre-wrap}</style></head><body><h1>${title}</h1><p class="muted">${escapeHtml(value.projectDir)} · ${escapeHtml(value.window.since)} → ${escapeHtml(value.window.until)}</p><div class="cards"><div class="card">输入 Token 节省<span class="value">${escapeHtml(formatNumber(value.savings.inputTokens))}</span><small>${escapeHtml(formatPercent(value.savings.inputTokenPercent))}</small></div><div class="card">总 Token 节省<span class="value">${escapeHtml(formatNumber(value.savings.totalTokens))}</span><small>${escapeHtml(formatPercent(value.savings.totalTokenPercent))}</small></div><div class="card">状态<span class="value">${escapeHtml(statusLabel(value.savings.status))}</span><small>响应覆盖 ${escapeHtml(formatPercent(value.coverage.responsePercent))}</small></div><div class="card">方案证据<span class="value">${escapeHtml(value.planCoverage.status)}</span><small>匹配 ${value.planCoverage.matchedResourceCount}/${value.planCoverage.resources.length}</small></div></div><div class="notice">预估报告：未重新执行 Codex；费用为等价 API 价格估算。Tokenizer: ${escapeHtml(value.evidence.tokenizer.mode)}${value.evidence.tokenizer.encoding ? ` / ${escapeHtml(value.evidence.tokenizer.encoding)}` : ''}</div>${costSummary}<h2>逐响应明细</h2><table><thead><tr><th>响应</th><th>模型</th><th>证据</th><th>状态</th><th>输入 Token</th><th>预计节省</th></tr></thead><tbody>${rows || '<tr><td colspan="6">无响应</td></tr>'}</tbody></table></body></html>`;
}
