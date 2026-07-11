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
  const cacheCatalogLines = buildCacheCatalogLines(result.catalog);
  const disabledLines = buildDisabledResourceLines(result.disabledItems, summary.disabledEstimatedTokens);
  const itemLines =
    items.length === 0
      ? ['- none']
      : items.flatMap((item) => [
          `- ${item.name}`,
          `  tokens: ${item.estimatedTokens}  platform: ${item.platform}  scope: ${item.scope}${formatSourceResource(item)}`,
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
    ...(summary.scope ? [`Scope: ${formatScope(summary.scope)}`] : []),
    `Estimated token tax: ${summary.totalEstimatedTokens} tokens/turn`,
    `Tokenizer: ${formatTokenizer(summary.tokenizer)}`,
    `Budget: ${summary.budgetTokens} tokens/turn`,
    `Grade: ${summary.grade} (${status})`,
    `Items scanned: ${summary.scanned}`,
    '',
    'By coding agent:',
    ...platformLines,
    ...(codexResourceLines.length > 0 ? ['', 'By Codex resource:', ...codexResourceLines] : []),
    ...(cacheCatalogLines.length > 0 ? ['', ...cacheCatalogLines] : []),
    '',
    'Highest cost items:',
    ...itemLines,
    ...(disabledLines.length > 0 ? ['', ...disabledLines] : []),
  ].join('\n');
}

function buildDisabledResourceLines(
  items: ContextCostResult['disabledItems'],
  disabledEstimatedTokens: number | undefined,
): string[] {
  if (!items || items.length === 0) return [];

  const concreteItems = items.filter((item) => !isDisabledAggregate(item));
  const itemLines = concreteItems.flatMap((item) => [
    `- ${item.name}`,
    `  potential tokens: ${item.estimatedTokens}  platform: ${item.platform}  scope: ${item.scope}${formatSourceResource(item)}`,
    `  kind: ${item.kind}  status: disabled  context cost: not counted`,
    item.id ? `  id: ${item.id}` : '',
    item.id && item.controllable !== false
      ? `  enable: skill-doctor context enable --id ${JSON.stringify(item.id)} --platform ${item.platform}`
      : `  enable: use the ${item.platform} configuration that disabled this resource`,
    `  path: ${item.sourcePath}`,
  ].filter(Boolean));

  return [
    'Disabled resources (not counted):',
    'These resources are disabled and do not contribute to Estimated token tax. Use the enable subcommand to turn them on.',
    ...(disabledEstimatedTokens ? [`Potential token tax if enabled: ${disabledEstimatedTokens} tokens/turn`] : []),
    ...itemLines,
  ];
}

function isDisabledAggregate(item: ContextCostResult['items'][number]): boolean {
  return item.id === 'codex:skill-list:disabled' || item.id === 'codex:plugin-list:disabled';
}

function buildCacheCatalogLines(catalog: ContextCostResult['catalog']): string[] {
  if (!catalog) return [];

  const pluginLines = catalog.plugins.length === 0
    ? ['- none']
    : catalog.plugins.flatMap((plugin) => {
        const version = plugin.version ? `@${plugin.version}` : '';
        const header = `- ${plugin.displayName} (${plugin.name}${version}; ${plugin.cacheSource})`;
        const detail = `  status: cached  context cost: not counted  UI entries: ${plugin.entries.length}`;
        const path = `  manifest: ${plugin.manifestPath}`;
        const icon = plugin.iconPath ? `  icon: ${plugin.iconPath}` : '';
        const entries = plugin.entries.flatMap((entry) => [
          `  - ${entry.displayName}: ${entry.description || '(no UI description)'}`,
          `    invocation: ${entry.invocation}  status: cached  context cost: not counted`,
          entry.iconPath ? `    icon: ${entry.iconPath}` : '',
          entry.defaultPrompt ? `    entry prompt: ${entry.defaultPrompt}` : '',
        ].filter(Boolean));
        return [header, detail, path, icon, ...entries].filter(Boolean);
      });

  return [
    'Cached Codex plugin catalog (not counted):',
    `Cache: ${catalog.cacheRoot}`,
    `Plugins: ${catalog.summary.plugins}  UI entries: ${catalog.summary.uiEntries}  explicit-only: ${catalog.summary.explicitOnlyEntries}`,
    ...pluginLines,
  ];
}

function formatScope(scope: NonNullable<ContextCostResult['summary']['scope']>): string {
  switch (scope) {
    case 'project':
      return 'project (current project only)';
    case 'global':
      return 'global (user/global configuration only)';
    default:
      return 'all (project + global; use --scope project to exclude user-level resources)';
  }
}

function formatTokenizer(tokenizer: ContextCostResult['summary']['tokenizer']): string {
  return [
    tokenizer.mode,
    tokenizer.model ? `model=${tokenizer.model}` : '',
    tokenizer.encoding ? `encoding=${tokenizer.encoding}` : '',
    tokenizer.fallback ? 'fallback=true' : '',
  ].filter(Boolean).join(' ');
}

function formatSourceResource(item: ContextCostResult['items'][number]): string {
  if (item.source && item.resource && item.source === item.resource) {
    return `  resource: ${item.resource}`;
  }
  return `${item.source ? `  source: ${item.source}` : ''}${item.resource ? `  resource: ${item.resource}` : ''}`;
}

function buildCodexResourceLines(items: ContextCostResult['items']): string[] {
  const counts = new Map<string, { active: number; tokens: number }>();

  for (const item of items) {
    if (item.platform !== 'codex' || !item.resource) continue;
    const current = counts.get(item.resource) ?? { active: 0, tokens: 0 };
    const tokens = chargeableCodexResourceTokens(item);
    current.active += 1;
    current.tokens += tokens;
    counts.set(item.resource, current);
  }

  return ['agents', 'skill', 'mcp', 'plugin', 'memory']
    .filter((resource) => counts.has(resource))
    .map((resource) => {
      const entry = counts.get(resource)!;
      return `- ${resource}: ${entry.tokens} tokens/turn (${entry.active} active)`;
    });
}

function chargeableCodexResourceTokens(item: ContextCostResult['items'][number]): number {
  if (item.kind === 'agent-skill-description' && (item.resource === 'skill' || item.resource === 'plugin')) {
    return 0;
  }
  return item.estimatedTokens;
}
