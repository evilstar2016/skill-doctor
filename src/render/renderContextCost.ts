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
  const itemLines =
    items.length === 0
      ? ['- none']
      : items.flatMap((item) => [
          `- ${item.name}`,
          `  tokens: ${item.estimatedTokens}  platform: ${item.platform}  scope: ${item.scope}`,
          `  kind: ${item.kind}  activation: ${item.activation}  budget: ${item.budgetScope}`,
          `  activation tokens: ${item.activationEstimatedTokens}  confidence: ${item.confidence}`,
          `  path: ${item.sourcePath}`,
          `  fix: ${item.recommendation}`,
        ]);

  return [
    'CONTEXT COST REPORT',
    ...(summary.projectPath ? [`Project: ${summary.projectPath}`] : []),
    `Estimated token tax: ${summary.totalEstimatedTokens} tokens/turn`,
    `Budget: ${summary.budgetTokens} tokens/turn`,
    `Grade: ${summary.grade} (${status})`,
    `Items scanned: ${summary.scanned}`,
    '',
    'By coding agent:',
    ...platformLines,
    '',
    'Highest cost items:',
    ...itemLines,
  ].join('\n');
}
