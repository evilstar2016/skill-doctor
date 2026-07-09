import type { ContextCostResult } from '../types/context';

export function renderContextCost(result: ContextCostResult): string {
  const { summary, items } = result;
  const status = summary.overBudget ? 'over budget' : 'within budget';
  const platformLines =
    summary.byPlatform.length === 0
      ? ['- none']
      : summary.byPlatform.map(
          (entry) => [
            `- ${entry.platform}: ${entry.estimatedTokens} tokens/turn (${entry.items} items)`,
            `  budget: ${entry.budgetTokens}  grade: ${entry.grade} (${entry.overBudget ? 'over budget' : 'within budget'})`,
            `  startup: ${entry.startupSelectionTokens}  always-on: ${entry.alwaysOnTokens}  activation risk: ${entry.activationTokens}`,
          ].join('\n'),
        );
  const codexResourceLines = buildCodexResourceLines(items);
  const itemLines =
    items.length === 0
      ? ['- none']
      : items.flatMap((item) => [
          `- ${item.name}`,
          `  tokens: ${item.estimatedTokens}  platform: ${item.platform}  scope: ${item.scope}${item.source ? `  source: ${item.source}` : ''}${item.resource ? `  resource: ${item.resource}` : ''}`,
          `  kind: ${item.kind}  activation: ${item.activation}  budget: ${item.budgetScope}`,
          `  activation tokens: ${item.activationEstimatedTokens}  confidence: ${item.confidence}${item.enabled === false ? '  disabled' : ''}`,
          item.id ? `  id: ${item.id}` : '',
          item.controllable !== undefined ? `  controllable: ${item.controllable}${item.controlMethod ? `  method: ${item.controlMethod}` : ''}` : '',
          `  path: ${item.sourcePath}`,
          `  fix: ${item.recommendation}`,
        ].filter(Boolean));

  return [
    'CONTEXT COST REPORT',
    ...(summary.projectPath ? [`Project: ${summary.projectPath}`] : []),
    `Estimated token tax: ${summary.totalEstimatedTokens} tokens/turn`,
    ...(summary.disabledEstimatedTokens ? [`Disabled token tax (not counted): ${summary.disabledEstimatedTokens} tokens/turn`] : []),
    `Budget: ${summary.budgetTokens} tokens/turn`,
    `Grade: ${summary.grade} (${status})`,
    `Items scanned: ${summary.scanned}`,
    '',
    'By coding agent:',
    ...platformLines,
    ...(codexResourceLines.length > 0 ? ['', 'By Codex resource:', ...codexResourceLines] : []),
    '',
    'Highest cost items:',
    ...itemLines,
  ].join('\n');
}

function buildCodexResourceLines(items: ContextCostResult['items']): string[] {
  const counts = new Map<string, { active: number; disabled: number; tokens: number; disabledTokens: number }>();

  for (const item of items) {
    if (item.platform !== 'codex' || !item.resource) continue;
    const current = counts.get(item.resource) ?? { active: 0, disabled: 0, tokens: 0, disabledTokens: 0 };
    const tokens = chargeableCodexResourceTokens(item);
    if (item.enabled === false) {
      current.disabled += 1;
      current.disabledTokens += tokens;
    } else {
      current.active += 1;
      current.tokens += tokens;
    }
    counts.set(item.resource, current);
  }

  return ['agents', 'skill', 'mcp', 'plugin', 'memory']
    .filter((resource) => counts.has(resource))
    .map((resource) => {
      const entry = counts.get(resource)!;
      const disabled = entry.disabled > 0 ? `  disabled: ${entry.disabled} (${entry.disabledTokens} tokens)` : '';
      return `- ${resource}: ${entry.tokens} tokens/turn (${entry.active} active)${disabled}`;
    });
}

function chargeableCodexResourceTokens(item: ContextCostResult['items'][number]): number {
  if (item.kind === 'agent-skill-description' && (item.resource === 'skill' || item.resource === 'plugin')) {
    return 0;
  }
  return item.estimatedTokens;
}
