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
  if (evidence === 'catalog-projection') return '最新目录假设模拟';
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
    ...(!report.historyAnalysis && report.plan?.sourceKind === 'offline' && report.plan.offline ? [
      `离线模拟: skills_instructions ${formatNumber(report.plan.offline.selectedSkillCount)}/${formatNumber(report.plan.offline.historicalSkillCandidateCount)} 个描述可确定移除，累计收益按历史响应计算；recommended_plugins ${formatNumber(report.plan.offline.recommendedPluginCount)} 个描述的条件潜力单独报告`,
      ...(report.plan.offline.descriptionEstimates ? [
        `  描述 Token（代表性完整上下文块）: Skill 确定 ${formatNumber(report.plan.offline.descriptionEstimates.skillsInstructions.verifiedRemovableTokens)}，未验证潜力 ${formatNumber(report.plan.offline.descriptionEstimates.skillsInstructions.unverifiedPotentialTokens)}；插件确定 ${formatNumber(report.plan.offline.descriptionEstimates.recommendedPlugins.verifiedRemovableTokens)}，未验证潜力 ${formatNumber(report.plan.offline.descriptionEstimates.recommendedPlugins.unverifiedPotentialTokens)}`,
      ] : []),
    ] : []),
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
    `  证据: 历史上下文快照 ${formatNumber(report.evidence.historicalContextSnapshotCount)} 个，含文本 ${formatNumber(report.evidence.historicalTextSnapshotCount)} 个（${formatNumber(report.evidence.historicalTextTokenCount)} Token）；上下文块 ${formatNumber(report.evidence.historicalContextBlockCount)} 个（${formatNumber(report.evidence.historicalContextBlockTokenCount)} Token），文本重建响应 ${formatNumber(report.evidence.textReconstructedResponseCount)} 条，方案来源 ${report.evidence.planEstimateEvidence === 'static-optimizer-estimate' ? 'Optimizer 静态估算' : report.evidence.planEstimateEvidence === 'offline-context-reconstruction' ? '离线上下文重建' : '无'}`,
    `  Tokenizer: ${report.evidence.tokenizer.mode}${report.evidence.tokenizer.model ? `，model=${report.evidence.tokenizer.model}` : ''}${report.evidence.tokenizer.encoding ? `，encoding=${report.evidence.tokenizer.encoding}` : ''}${report.evidence.tokenizer.fallback ? '，fallback=true' : ''}`,
    '',
    `基线输入/输出/总量: ${formatNumber(report.baseline.inputTokens)} / ${formatNumber(report.baseline.outputTokens)} / ${formatNumber(report.baseline.totalTokens)}`,
    `预计输入/输出/总量: ${formatNumber(report.projected.inputTokens)} / ${formatNumber(report.projected.outputTokens)} / ${formatNumber(report.projected.totalTokens)}`,
  ];

  if (report.historyAnalysis) lines.push('', renderHistorySummary(report));
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

export function renderHistorySummary(report: BenefitReport): string {
  const h = report.historyAnalysis;
  if (!h) return '';
  const b = h.baselineSession;
  const first = h.firstResponse;
  return [
    '最新目录 × 最长主会话：描述 Token 假设模拟（不是实际已节省）',
    `历史画像: ${h.historyCoverage.sessionCount} 个主会话 / ${h.historyCoverage.fileCount} 个文件；${h.historyCoverage.since} → ${h.historyCoverage.until}；归档=${h.historyCoverage.includesArchived}；范围受限=${h.historyCoverage.limited}；不完整文件=${h.historyCoverage.incompleteFiles}`,
    `基准: ${b?.sessionId ?? '未知'}；${b?.sourcePath ?? '—'}；${b?.firstTimestamp ?? '—'} → ${b?.lastTimestamp ?? '—'}`,
    `选择规则: 主线程完整模型响应数最多，相同次数取最近活动，排除系统/reviewer。去重用户消息 ${b?.userMessageCount ?? 0} / 原生 UserMessage item ${b?.userMessageItemCount ?? 0}；turn_id ${b?.distinctTurnCount ?? 0}；完成轮次 ${b?.completedTurnCount ?? 0}；模型响应 ${b?.responseCount ?? 0}`,
    ...h.catalogSources.map((source) => `目录 ${source.kind}: ${source.sessionId} / ${source.timestamp} / ${source.sourcePath}:${source.line} / SHA256 ${source.sha256}`),
    `候选: ${h.usageProfile.length}；建议审阅关闭 ${h.usageProfile.filter((item) => item.recommendation === 'review-disable').length}；有使用记录保留 ${h.usageProfile.filter((item) => item.recommendation === 'retain').length}；未知 ${h.usageProfile.filter((item) => item.recommendation === 'unknown').length}`,
    `每响应描述差值: ${formatNumber(h.descriptionTokensPerResponse)}（skills_instructions ${formatNumber(h.blockDeltas.skills_instructions)}；recommended_plugins ${formatNumber(h.blockDeltas.recommended_plugins)}）`,
    `首响应 ${first?.responseId ?? '—'}: 实测输入 ${formatNumber(first?.before.inputTokens)} / 缓存读 ${formatNumber(first?.before.cachedInputTokens)} / 缓存写 ${formatNumber(first?.before.cacheWriteInputTokens)}；描述差值 ${formatNumber(first?.descriptionTokens)}；描述缓存读归属范围 ${formatNumber(first?.cacheAttribution?.lower)}–${formatNumber(first?.cacheAttribution?.upper)}`,
    `首次可识别交互 ${h.firstInteraction?.turnId ?? '—'}: ${formatNumber(h.firstInteraction?.responseCount)} 条响应；描述累计 ${formatNumber(h.firstInteraction?.descriptionTokens)}`,
    `历史回放（另一个场景）: ${formatNumber(h.historicalReplay.inputTokens)} Token；可重建 ${h.historicalReplay.coveredResponses} 条 / 未知 ${h.historicalReplay.unknownResponses} 条`,
    `子任务单列，不计主会话收益: ${h.childUsage.responseCount} 条响应；输入 ${formatNumber(h.childUsage.inputTokens)} / 缓存读 ${formatNumber(h.childUsage.cachedInputTokens)}`,
    `插件逐项控制: ${h.pluginControl.perId}`,
    `插件整块控制: ${h.pluginControl.wholeBlock}；本次集合整块移除=${h.pluginControl.wholeBlockSelected}；宿主新会话验证=false`,
    '逐项屏蔽可能候选补位（最多显示50项）。整块关闭同时关闭模型安装建议，不关闭已安装插件。未知 Skill 控制仅计假设潜力；不自动禁用插件或兄弟技能。',
    '缓存前缀优先场景：先扣缓存读，再扣缓存写，最后普通输入；只掌握整请求缓存用量，不能证明描述块命中。',
    '',
    '建议操作（默认仅当前项目，先预览、确认后写入）:',
    '默认逐项审阅；未观察到使用不等于不需要。保留项目依赖、安全工具和不确定条目。若不需要自动发现插件，可整块关闭推荐；仍需要推荐时不建议整块关闭。整块收益不能直接沿用逐项子集估算。',
    ...h.usageProfile.flatMap((item) => [
      `${item.name} [${item.kind}]：${item.recommendation === 'retain' ? '建议保留：历史有可靠使用证据' : item.recommendation === 'unknown' ? '待确认：证据不足，默认保留' : '建议审阅禁用：已扫描历史未发现可靠使用；若近期任务或项目依赖需要则保留'}；控制 ${item.control}`,
      `  引用 ${item.explicitMentionCount} / 激活 ${item.activationCount} / 读取 ${item.observedReadCount} / 使用会话 ${item.usedSessionCount}；${item.reason}`,
      ...item.evidence.map((entry) => `  证据 ${entry.kind}: ${entry.sessionId} · ${entry.sourcePath}:${entry.line}`),
      `  控制说明: ${item.controlMethod ?? '独立控制未验证，不自动扩大为整插件禁用'}`,
      ...(item.control !== 'unverified' ? [`  预览: skill-doctor context control --report <本项目报告.json> --kind ${item.kind} --id ${shellQuote(item.id)} --action disable`] : []),
    ]),
    '整块预览: skill-doctor context control --report <本项目报告.json> --kind recommendations --id recommended_plugins --action disable',
    '确认后重复预览命令并增加 --confirm <digest>；恢复: skill-doctor context control --undo <operation-id> --confirm <operation-id>。均须在报告项目目录运行。配置写入核验不等于新会话运行时节省。',
  ].join('\n');
}

function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

export function renderBenefitCsv(report: BenefitReport): string {
  const fields = ['baseline_session', 'response_id', 'turn_id', 'timestamp', 'model', 'input', 'cached_read', 'cache_write', 'description_delta', 'cache_lower', 'cache_upper', 'removed_cached_read', 'removed_cache_write', 'removed_ordinary', 'historical_replay_delta'];
  const rows = report.historyAnalysis?.responses.map((row) => [report.historyAnalysis?.baselineSession?.sessionId, row.responseId, row.turnId, row.timestamp, row.model, row.before.inputTokens, row.before.cachedInputTokens, row.before.cacheWriteInputTokens, row.descriptionTokens, row.cacheAttribution?.lower, row.cacheAttribution?.upper, row.cacheAttribution?.cachedRead, row.cacheAttribution?.cacheWrite, row.cacheAttribution?.ordinary, row.replayTokens]) ?? report.responses.map((row) => [row.sessionId, row.responseId, row.turnId, row.timestamp, row.model, row.before.inputTokens, row.before.cachedInputTokens, row.before.cacheWriteInputTokens, row.estimatedInputSavings]);
  const cell = (value: unknown): string => {
    const text = String(value ?? '');
    return `"${(/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
  };
  return [fields, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}

export function renderBenefitHtml(report: BenefitReport, options: { redact?: boolean } = {}): string {
  const value = options.redact === false ? report : redactBenefitReport(report);
  const historyHtml = value.historyAnalysis ? `<h2>历史画像与估算基准</h2><pre style="white-space:pre-wrap">${escapeHtml(renderHistorySummary(value))}</pre><details><summary>使用画像 / 关闭建议 / 逐轮与逐响应缓存明细</summary><pre style="white-space:pre-wrap">${escapeHtml(JSON.stringify(value.historyAnalysis, null, 2))}</pre></details>` : '';
  const rows = value.responses.map((response) => `<tr><td>${escapeHtml(response.responseId)}</td><td>${escapeHtml(response.model ?? 'unknown')}</td><td>${escapeHtml(evidenceLabel(response.evidence))}</td><td>${escapeHtml(response.status)}</td><td>${escapeHtml(formatNumber(response.before.inputTokens))}</td><td>${escapeHtml(formatNumber(response.estimatedInputSavings))}</td></tr>`).join('');
  const scenarioRows = value.scenarios.map((scenario) => `<tr><td>${escapeHtml(scenario.label)}</td><td>${escapeHtml(formatCost(scenario.baseline.amount, scenario.baseline.currency ?? 'USD'))}</td><td>${escapeHtml(formatCost(scenario.projected.amount, scenario.projected.currency ?? scenario.baseline.currency ?? 'USD'))}</td><td>${escapeHtml(formatCost(scenario.savings, scenario.baseline.currency ?? 'USD'))}</td><td>${escapeHtml(scenario.baseline.reason ?? '')}</td></tr>`).join('');
  const modelRows = value.modelCosts.map((model) => `<tr><td>${escapeHtml(model.model)}</td><td>${model.pricedResponseCount}/${model.responseCount}</td><td>${escapeHtml(formatCost(model.baseline.amount, model.baseline.currency ?? 'USD'))}</td><td>${escapeHtml(formatCost(model.projected?.amount, model.projected?.currency ?? model.baseline.currency ?? 'USD'))}</td><td>${escapeHtml(model.baseline.reason ?? '')}</td></tr>`).join('');
  const costSummary = scenarioRows || modelRows ? `<h2>费用情景</h2>${scenarioRows ? '<h3>缓存情景</h3><table><thead><tr><th>情景</th><th>基线</th><th>预计</th><th>节省</th><th>说明</th></tr></thead><tbody>' + scenarioRows + '</tbody></table>' : ''}${modelRows ? '<h3>按模型</h3><table><thead><tr><th>模型</th><th>已计价</th><th>基线</th><th>预计</th><th>说明</th></tr></thead><tbody>' + modelRows + '</tbody></table>' : ''}` : '';
  const title = escapeHtml('Codex 优化收益预估');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font:14px system-ui,sans-serif;max-width:1100px;margin:32px auto;padding:0 20px;color:#17202a}h1{margin-bottom:4px}small,.muted{color:#5d6b78}.cards{display:flex;gap:12px;flex-wrap:wrap}.card{border:1px solid #d8e0e7;border-radius:10px;padding:12px 16px;min-width:170px}.value{font-size:24px;font-weight:700;display:block}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border-bottom:1px solid #e5e9ee;text-align:left;padding:8px}th{background:#f5f7f9}.notice{background:#fff6d8;padding:12px;border-radius:8px;margin:16px 0;white-space:pre-wrap}</style></head><body><h1>${title}</h1><p class="muted">${escapeHtml(value.projectDir)} · ${escapeHtml(value.window.since)} → ${escapeHtml(value.window.until)}</p><div class="cards"><div class="card">输入 Token 节省<span class="value">${escapeHtml(formatNumber(value.savings.inputTokens))}</span><small>${escapeHtml(formatPercent(value.savings.inputTokenPercent))}</small></div><div class="card">总 Token 节省<span class="value">${escapeHtml(formatNumber(value.savings.totalTokens))}</span><small>${escapeHtml(formatPercent(value.savings.totalTokenPercent))}</small></div><div class="card">状态<span class="value">${escapeHtml(statusLabel(value.savings.status))}</span><small>响应覆盖 ${escapeHtml(formatPercent(value.coverage.responsePercent))}</small></div><div class="card">方案证据<span class="value">${escapeHtml(value.planCoverage.status)}</span><small>匹配 ${value.planCoverage.matchedResourceCount}/${value.planCoverage.resources.length}</small></div></div><div class="notice">预估报告：未重新执行 Codex；费用为等价 API 价格估算。Tokenizer: ${escapeHtml(value.evidence.tokenizer.mode)}${value.evidence.tokenizer.encoding ? ` / ${escapeHtml(value.evidence.tokenizer.encoding)}` : ''}</div>${historyHtml}${costSummary}<h2>逐响应明细</h2><table><thead><tr><th>响应</th><th>模型</th><th>证据</th><th>状态</th><th>输入 Token</th><th>预计节省</th></tr></thead><tbody>${rows || '<tr><td colspan="6">无响应</td></tr>'}</tbody></table></body></html>`;
}
