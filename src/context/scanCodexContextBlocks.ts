import { createTokenCounter } from './tokenCounter';
import type {
  CodexAvailableSkillEntry,
  CodexContextBlockActivation,
  CodexContextBlockAnalysis,
  CodexContextBlockId,
  CodexContextBlockObservation,
  CodexContextBlockRole,
  CodexRecommendedPluginEntry,
  CodexSkillRootAlias,
  ContextTokenizerMode,
} from '../types/context';

interface BlockDefinition {
  id: CodexContextBlockId;
  start: string;
  end: string;
  role: CodexContextBlockRole;
  contentKind?: string;
  activation: CodexContextBlockActivation;
  controlMethod?: string;
  controllable?: boolean;
  recommendation: string;
}

const BLOCK_DEFINITIONS: BlockDefinition[] = [
  {
    id: 'skills_instructions',
    start: '<skills_instructions>',
    end: '</skills_instructions>',
    role: 'developer',
    contentKind: 'skills.catalog',
    activation: 'initial-context',
    controlMethod: 'skills.include_instructions or skills.config',
    recommendation: 'Treat Skill roots as shared catalog overhead; recompute the catalog after changing Skills.',
  },
  {
    id: 'recommended_plugins',
    start: '<recommended_plugins>',
    end: '</recommended_plugins>',
    role: 'user',
    contentKind: 'plugins.recommendations',
    activation: 'initial-context',
    controlMethod: 'features.tool_suggest + features.recommended_plugins (composite)',
    controllable: false,
    recommendation: 'Source-supported controls: tool_suggest.disabled_tools filters exact plugin IDs (may refill unseen candidates); set both features.tool_suggest=false and features.recommended_plugins=false to remove the block and installation suggestions. Host runtime verification is separate. Do not use plugins.<id>.enabled.',
  },
  {
    id: 'permissions_instructions',
    start: '<permissions instructions>',
    end: '</permissions instructions>',
    role: 'developer',
    activation: 'world-state',
    controlMethod: 'include_permissions_instructions',
    controllable: false,
    recommendation: 'Measure first; disabling permission guidance can change safety behavior.',
  },
  {
    id: 'collaboration_mode',
    start: '<collaboration_mode>',
    end: '</collaboration_mode>',
    role: 'developer',
    activation: 'world-state',
    controlMethod: 'include_collaboration_mode_instructions',
    controllable: false,
    recommendation: 'Measure as dynamic world-state overhead; do not disable by default.',
  },
  {
    id: 'apps_instructions',
    start: '<apps_instructions>',
    end: '</apps_instructions>',
    role: 'developer',
    activation: 'world-state',
    controlMethod: 'include_apps_instructions',
    controllable: false,
    recommendation: 'Measure together with enabled App capabilities; disabling may remove functionality.',
  },
  {
    id: 'plugins_instructions',
    start: '<plugins_instructions>',
    end: '</plugins_instructions>',
    role: 'developer',
    activation: 'world-state',
    controlMethod: 'model.include_plugin_usage_instructions',
    controllable: false,
    recommendation: 'Measure separately from installed Plugin Skills and MCP tool definitions.',
  },
  {
    id: 'environment_context',
    start: '<environment_context>',
    end: '</environment_context>',
    role: 'user',
    activation: 'world-state',
    controlMethod: 'include_environment_context',
    controllable: false,
    recommendation: 'Measure before changing; disabling may remove cwd and workspace information.',
  },
  {
    id: 'app_context',
    start: '<app-context>',
    end: '</app-context>',
    role: 'unknown',
    contentKind: 'host.app_context',
    activation: 'world-state',
    controlMethod: 'host-provided',
    controllable: false,
    recommendation: 'Observe as host overhead; do not attribute it to a Skill or disable it automatically.',
  },
];

export interface AnalyzeCodexContextBlocksOptions {
  sourcePath?: string;
  tokenizer?: ContextTokenizerMode;
  tokenizerModel?: string;
}

export function analyzeCodexContextBlocks(
  text: string,
  options: AnalyzeCodexContextBlocksOptions = {},
): CodexContextBlockAnalysis {
  const tokenCounter = createTokenCounter({
    tokenizer: options.tokenizer,
    tokenizerModel: options.tokenizerModel,
  });
  const blocks = findBlocks(text, tokenCounter.count);
  const diagnostics = blocks
    .filter((block) => !block.complete)
    .map((block) => `Incomplete ${block.tag} block at offset ${block.startOffset}`);
  const knownRanges = blocks.map((block) => [block.startOffset, block.endOffset] as const);
  const unmatchedTags = findUnmatchedTags(text, knownRanges);
  diagnostics.push(...unmatchedTags.map((tag) => `Unmatched context tag: ${tag}`));

  return {
    ...(options.sourcePath ? { sourcePath: options.sourcePath } : {}),
    textChars: text.length,
    totalEstimatedTokens: blocks.reduce((sum, block) => sum + block.estimatedTokens, 0),
    tokenizer: tokenCounter.summary,
    blocks,
    diagnostics,
  };
}

function findBlocks(text: string, countTokens: (value: string) => number): CodexContextBlockObservation[] {
  const blocks: CodexContextBlockObservation[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const next = nextBlockStart(text, cursor);
    if (!next) break;
    const { definition, startOffset } = next;
    const contentStart = startOffset + definition.start.length;
    const endMarkerOffset = findClosingMarker(text, definition, contentStart);
    const complete = endMarkerOffset >= 0;
    const endOffset = complete ? endMarkerOffset + definition.end.length : text.length;
    const blockText = text.slice(startOffset, endOffset);
    const body = text.slice(contentStart, complete ? endMarkerOffset : text.length);
    const observation: CodexContextBlockObservation = {
      id: definition.id,
      tag: definition.start,
      role: definition.role,
      ...(definition.contentKind ? { contentKind: definition.contentKind } : {}),
      activation: definition.activation,
      text: blockText,
      estimatedTokens: countTokens(blockText),
      estimatedChars: blockText.length,
      complete,
      startOffset,
      endOffset,
      ...blockDetails(definition.id, body),
      ...(definition.controlMethod ? { controlMethod: definition.controlMethod } : {}),
      ...(definition.controllable !== undefined ? { controllable: definition.controllable } : {}),
      recommendation: definition.recommendation,
    };
    blocks.push(observation);
    cursor = Math.max(endOffset, startOffset + definition.start.length);
  }

  return blocks;
}

function nextBlockStart(text: string, offset: number): { definition: BlockDefinition; startOffset: number } | undefined {
  let result: { definition: BlockDefinition; startOffset: number } | undefined;
  for (const definition of BLOCK_DEFINITIONS) {
    const startOffset = text.indexOf(definition.start, offset);
    if (startOffset < 0 || (result && startOffset >= result.startOffset)) continue;
    result = { definition, startOffset };
  }
  return result;
}

function findUnmatchedTags(text: string, knownRanges: Array<readonly [number, number]>): string[] {
  const result: string[] = [];
  for (const definition of BLOCK_DEFINITIONS) {
    let offset = 0;
    while (offset < text.length) {
      const startOffset = text.indexOf(definition.start, offset);
      if (startOffset < 0) break;
      const covered = knownRanges.some(([start, end]) => startOffset >= start && startOffset < end);
      if (!covered) result.push(definition.start);
      offset = startOffset + definition.start.length;
    }
  }
  return [...new Set(result)];
}

function findClosingMarker(text: string, definition: BlockDefinition, offset: number): number {
  const firstMatch = text.indexOf(definition.end, offset);
  if (firstMatch < 0 || isLineStart(text, firstMatch)) return firstMatch;

  const nextDifferentBlock = BLOCK_DEFINITIONS
    .filter((candidate) => candidate.id !== definition.id)
    .map((candidate) => text.indexOf(candidate.start, offset))
    .filter((candidate) => candidate >= 0)
    .sort((left, right) => left - right)[0] ?? text.length;

  let cursor = firstMatch + definition.end.length;
  while (cursor < nextDifferentBlock) {
    const match = text.indexOf(definition.end, cursor);
    if (match < 0 || match >= nextDifferentBlock) break;
    if (isLineStart(text, match)) return match;
    cursor = match + definition.end.length;
  }
  return firstMatch;
}

function isLineStart(text: string, offset: number): boolean {
  return offset === 0 || text[offset - 1] === '\n' || text[offset - 1] === '\r';
}

function blockDetails(
  id: CodexContextBlockId,
  body: string,
): Pick<CodexContextBlockObservation, 'rootAliases' | 'availableSkills' | 'recommendedPlugins'> {
  if (id === 'skills_instructions') {
    const rootAliases = parseRootAliases(body);
    const availableSkills = parseAvailableSkills(body);
    return {
      ...(rootAliases.length > 0 ? { rootAliases } : {}),
      ...(availableSkills.length > 0 ? { availableSkills } : {}),
    };
  }
  if (id === 'recommended_plugins') {
    const recommendedPlugins = parseRecommendedPlugins(body);
    return recommendedPlugins.length > 0 ? { recommendedPlugins } : {};
  }
  return {};
}

function parseRootAliases(body: string): CodexSkillRootAlias[] {
  const aliases: CodexSkillRootAlias[] = [];
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^\s*-\s+`([^`]+)`\s*=\s*`([^`]+)`\s*$/);
    if (match) aliases.push({ alias: match[1], path: match[2] });
  }
  return aliases;
}

function parseAvailableSkills(body: string): CodexAvailableSkillEntry[] {
  const marker = body.indexOf('### Available skills');
  if (marker < 0) return [];
  const result: CodexAvailableSkillEntry[] = [];
  for (const line of body.slice(marker).split(/\r?\n/).slice(1)) {
    const match = line.match(/^\s*-\s+(.+?):\s+(.*)$/);
    if (match) result.push({ name: match[1].trim(), description: match[2].trim() });
  }
  return result;
}

function parseRecommendedPlugins(body: string): CodexRecommendedPluginEntry[] {
  const result: CodexRecommendedPluginEntry[] = [];
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^\s*-\s+(.+?)\s+\(([^()\n]+)\)\s*$/);
    if (match) result.push({ name: match[1].trim(), id: match[2].trim() });
  }
  return result;
}
