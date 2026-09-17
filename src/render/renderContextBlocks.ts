import type { CodexContextBlockAnalysis } from '../types/context';

export function renderCodexContextBlocks(result: CodexContextBlockAnalysis): string {
  const blockLines = result.blocks.length === 0
    ? ['- none']
    : result.blocks.flatMap((block) => [
        `- ${block.id}`,
        `  tag: ${block.tag}  role: ${block.role}  activation: ${block.activation}`,
        `  tokens: ${block.estimatedTokens}  chars: ${block.estimatedChars}  complete: ${block.complete}`,
        block.contentKind ? `  content kind: ${block.contentKind}` : '',
        block.rootAliases?.length ? `  root aliases: ${block.rootAliases.length}` : '',
        block.availableSkills?.length ? `  available skills: ${block.availableSkills.length}` : '',
        block.recommendedPlugins?.length ? `  recommended plugins: ${block.recommendedPlugins.length}` : '',
        block.controlMethod ? `  control: ${block.controlMethod}` : '',
        block.controllable !== undefined ? `  controllable: ${block.controllable}` : '',
        block.controlStatus ? `  control status: ${block.controlStatus}` : '',
        block.evidenceLevel ? `  evidence: ${block.evidenceLevel}` : '',
        block.provenance ? `  provenance: ${block.provenance.sourcePath}:${block.provenance.line}${block.provenance.contentItemKind ? ` kind=${block.provenance.contentItemKind}` : ''}${block.provenance.contentItemIndex !== undefined ? ` item=${block.provenance.contentItemIndex}` : ''}` : '',
        `  note: ${block.recommendation}`,
      ].filter(Boolean));
  const diagnostics = result.diagnostics.length === 0
    ? []
    : ['', 'Diagnostics:', ...result.diagnostics.map((diagnostic) => `- ${diagnostic}`)];

  return [
    'CODEX CONTEXT BLOCK REPORT',
    ...(result.sourcePath ? [`Source: ${result.sourcePath}`] : []),
    ...(result.evidenceLevel ? [`Evidence: ${result.evidenceLevel}`] : []),
    `Observed text: ${result.textChars} chars`,
    `Estimated block tokens: ${result.totalEstimatedTokens}`,
    `Tokenizer: ${formatTokenizer(result.tokenizer)}`,
    ...(result.verification ? ['', 'Verification:', ...result.verification.map((entry) => `- ${entry.id}: ${entry.status}${entry.line ? ` (${entry.sourcePath ?? result.sourcePath ?? 'session'}:${entry.line})` : ''} — ${entry.reason}`)] : []),
    '',
    'Blocks:',
    ...blockLines,
    ...diagnostics,
  ].join('\n');
}

function formatTokenizer(tokenizer: CodexContextBlockAnalysis['tokenizer']): string {
  return [
    tokenizer.mode,
    tokenizer.model ? `model=${tokenizer.model}` : '',
    tokenizer.encoding ? `encoding=${tokenizer.encoding}` : '',
    tokenizer.fallback ? 'fallback=true' : '',
  ].filter(Boolean).join(' ');
}
