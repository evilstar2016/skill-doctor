import type { ContextCostResult } from '../types/context';

export function renderContextCost(result: ContextCostResult): string {
  const { summary, items } = result;
  const status = summary.overBudget ? 'over budget' : 'within budget';
  const itemLines =
    items.length === 0
      ? ['- none']
      : items.flatMap((item) => [
          `- ${item.name}`,
          `  tokens: ${item.estimatedTokens}  platform: ${item.platform}  scope: ${item.scope}`,
          `  kind: ${item.kind}`,
          `  path: ${item.sourcePath}`,
          `  fix: ${item.recommendation}`,
        ]);

  return [
    'CONTEXT COST REPORT',
    `Estimated token tax: ${summary.totalEstimatedTokens} tokens/turn`,
    `Budget: ${summary.budgetTokens} tokens/turn`,
    `Grade: ${summary.grade} (${status})`,
    `Items scanned: ${summary.scanned}`,
    '',
    'Highest cost items:',
    ...itemLines,
  ].join('\n');
}
