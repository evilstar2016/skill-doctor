import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';

import { llmExtractProvenance } from '../explain/llmExplain';
import type { LlmExplainOptions } from '../types/explain';
import type { SkillFile, SkillProvenance, SkillRecord } from '../types/skill';
import type { ProvenanceCache } from './provenanceCache';
import { extractBulletLines, uniqueStrings } from './extractTriggers';

interface FrontmatterData {
  name?: string;
  description?: string;
  when_to_use?: string;
  author?: string;
  repository?: string;
  /** Official Claude field name; `globs` kept for backward compat */
  paths: string[];
  globs: string[];
  applyTo?: string;
}

interface SkillDirMetadata {
  name?: string;
  description?: string;
  author?: string;
  repository?: string;
  rawFiles: Record<string, string>;
}

interface ParseSkillOptions {
  llmOptions?: LlmExplainOptions;
  provenanceCache?: ProvenanceCache;
}

type ListField = 'globs' | 'paths';
type BlockScalarField = 'description' | 'when_to_use' | 'applyTo';
type BlockScalarStyle = 'folded' | 'literal';
type GitProvenance = Pick<SkillProvenance, 'author' | 'repository'>;

const gitRepoCache = new Map<string, string | null>();
const gitAuthorCache = new Map<string, string | null>();
const SKILL_METADATA_FILE_NAMES = ['manifest.json', 'meta.json', 'metadata.json'] as const;

export async function parseSkill(file: SkillFile, options: ParseSkillOptions = {}): Promise<SkillRecord | null> {
  const raw = readFileSync(file.filePath, 'utf8');

  if (!raw.trim()) {
    return null;
  }

  const skillDir = dirname(file.filePath);
  const metadata = readSkillDirMetadata(skillDir);
  const { frontmatter, body } = splitFrontmatter(raw);
  const heading = extractHeading(body);
  const description =
    frontmatter.description ??
    metadata.description ??
    extractNamedSection(body, 'Description')?.replace(/\s+/g, ' ').trim() ??
    body.trim().slice(0, 200);

  const triggers = uniqueStrings([
    ...extractSectionTriggers(body, 'When to Use'),
    ...extractSectionTriggers(body, 'Trigger'),
    ...(frontmatter.when_to_use ? [frontmatter.when_to_use] : []),
    ...frontmatter.paths,
    ...frontmatter.globs,
    ...(frontmatter.applyTo ? [frontmatter.applyTo] : []),
    ...(frontmatter.description ? [frontmatter.description] : []),
    ...(!frontmatter.description && metadata.description ? [metadata.description] : []),
  ]);

  const provenance = await resolveProvenance(
    file,
    skillDir,
    raw,
    frontmatter,
    metadata,
    frontmatter.name ?? metadata.name ?? heading ?? getFallbackName(file.filePath),
    options.llmOptions,
    options.provenanceCache,
  );

  return {
    name: frontmatter.name ?? metadata.name ?? heading ?? getFallbackName(file.filePath),
    sourcePath: file.filePath,
    platform: file.platform,
    scope: file.scope,
    description,
    triggers,
    provenance,
  };
}

async function resolveProvenance(
  file: SkillFile,
  skillDir: string,
  raw: string,
  frontmatter: FrontmatterData,
  metadata: SkillDirMetadata,
  skillName: string,
  llmOptions?: LlmExplainOptions,
  provenanceCache?: ProvenanceCache,
): Promise<SkillProvenance> {
  const gitProvenance = readGitProvenance(skillDir, file.filePath);
  let repository = gitProvenance.repository ?? metadata.repository ?? frontmatter.repository;
  let author = gitProvenance.author ?? metadata.author ?? frontmatter.author;

  const cached = provenanceCache?.get(file.filePath);

  if (!repository || !author) {
    repository ??= cached?.repository;
    author ??= cached?.author;
  }

  if ((!repository || !author) && llmOptions && cached?.resolved !== true) {
    const llmProvenance = await llmExtractProvenance(
      {
        skillName,
        sourcePath: file.filePath,
        frontmatter: {
          ...(frontmatter.author ? { author: frontmatter.author } : {}),
          ...(frontmatter.repository ? { repository: frontmatter.repository } : {}),
        },
        metadataFiles: truncateMetadataFiles(metadata.rawFiles),
        content: truncateText(raw, 6000),
      },
      llmOptions,
    );

    provenanceCache?.set(file.filePath, {
      ...(llmProvenance?.repository ? { repository: llmProvenance.repository } : {}),
      ...(llmProvenance?.author ? { author: llmProvenance.author } : {}),
      resolved: true,
    });

    repository ??= llmProvenance?.repository;
    author ??= llmProvenance?.author;
  }

  return {
    installSource: file.installSource,
    confidence: file.confidence,
    ...(repository ? { repository } : {}),
    ...(author ? { author } : {}),
  };
}

function splitFrontmatter(content: string): { frontmatter: FrontmatterData; body: string } {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return {
      frontmatter: { globs: [], paths: [] },
      body: content,
    };
  }

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

  if (!match) {
    return {
      frontmatter: { globs: [], paths: [] },
      body: content,
    };
  }

  return {
    frontmatter: parseFrontmatter(match[1]),
    body: match[2],
  };
}

function parseFrontmatter(raw: string): FrontmatterData {
  const lines = raw.split(/\r?\n/);
  const parsed: FrontmatterData = { paths: [], globs: [] };
  let activeList: ListField | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith('- ') && activeList !== null) {
      const value = stripQuotes(trimmed.slice(2).trim());
      if (activeList === 'globs') parsed.globs.push(value);
      else parsed.paths.push(value);
      continue;
    }

    activeList = null;

    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key === 'globs') {
      const inlineValues = parseInlineArray(value);
      if (inlineValues) {
        parsed.globs.push(...inlineValues);
      } else {
        activeList = 'globs';
      }
      continue;
    }

    if (key === 'paths') {
      const inlineValues = parseInlineArray(value);
      if (inlineValues) {
        parsed.paths.push(...inlineValues);
      } else {
        activeList = 'paths';
      }
      continue;
    }

    const blockScalarStyle = parseBlockScalarStyle(value);
    if (blockScalarStyle && isBlockScalarField(key)) {
      const blockScalar = readBlockScalar(lines, index + 1, blockScalarStyle);
      parsed[key] = blockScalar.value;
      index = blockScalar.nextIndex - 1;
      continue;
    }

    if (key === 'name') {
      parsed.name = stripQuotes(value);
    }

    if (key === 'description') {
      parsed.description = stripQuotes(value);
    }

    if (key === 'when_to_use') {
      parsed.when_to_use = stripQuotes(value);
    }

    if (key === 'author') {
      parsed.author = stripQuotes(value);
    }

    if (key === 'repository' || key === 'repo') {
      parsed.repository = stripQuotes(value);
    }

    if (key === 'applyTo') {
      parsed.applyTo = stripQuotes(value);
    }
  }

  return parsed;
}

function parseInlineArray(value: string): string[] | null {
  if (!value.startsWith('[') || !value.endsWith(']')) {
    return null;
  }

  return value
    .slice(1, -1)
    .split(',')
    .map((item) => stripQuotes(item.trim()))
    .filter(Boolean);
}

function parseBlockScalarStyle(value: string): BlockScalarStyle | null {
  if (!value.startsWith('>') && !value.startsWith('|')) {
    return null;
  }

  const suffix = value.slice(1);
  if (suffix && !/^(?:[+-]?\d*|\d+[+-]?)$/.test(suffix)) {
    return null;
  }

  return value[0] === '>' ? 'folded' : 'literal';
}

function isBlockScalarField(key: string): key is BlockScalarField {
  return key === 'description' || key === 'when_to_use' || key === 'applyTo';
}

function readBlockScalar(
  lines: string[],
  startIndex: number,
  style: BlockScalarStyle,
): { value: string; nextIndex: number } {
  const blockLines: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      blockLines.push('');
      index += 1;
      continue;
    }

    if (!/^\s/.test(line)) {
      break;
    }

    blockLines.push(line);
    index += 1;
  }

  const normalizedLines = normalizeBlockLines(blockLines);
  return {
    value: style === 'literal' ? normalizedLines.join('\n').trim() : foldBlockLines(normalizedLines),
    nextIndex: index,
  };
}

function normalizeBlockLines(lines: string[]): string[] {
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^\s*/)?.[0].length ?? 0);

  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;

  return lines.map((line) => {
    if (!line.trim()) {
      return '';
    }

    return line.slice(minIndent);
  });
}

function foldBlockLines(lines: string[]): string {
  const paragraphs: string[] = [];
  let currentParagraph: string[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph.join(' ').replace(/\s+/g, ' ').trim());
        currentParagraph = [];
      }
      continue;
    }

    currentParagraph.push(line.trim());
  }

  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph.join(' ').replace(/\s+/g, ' ').trim());
  }

  return paragraphs.join('\n\n').trim();
}

function readSkillDirMetadata(skillDir: string): SkillDirMetadata {
  const metadata: SkillDirMetadata = { rawFiles: {} };

  for (const fileName of SKILL_METADATA_FILE_NAMES) {
    const metadataPath = join(skillDir, fileName);
    if (!existsSync(metadataPath)) {
      continue;
    }

    const raw = readFileSync(metadataPath, 'utf8');
    metadata.rawFiles[fileName] = raw;

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      metadata.name ??= typeof parsed.name === 'string' ? parsed.name : undefined;
      metadata.description ??= typeof parsed.description === 'string' ? parsed.description : undefined;
      metadata.author ??= readMetadataAuthor(parsed.author);
      metadata.repository ??= readMetadataRepository(parsed);
    } catch {
      continue;
    }
  }

  return metadata;
}

function readGitProvenance(skillDir: string, filePath: string): GitProvenance {
  if (!existsSync(join(skillDir, '.git'))) {
    return {};
  }

  return {
    repository: readGitRepository(skillDir) ?? undefined,
    author: readGitAuthor(skillDir, filePath) ?? undefined,
  };
}

function readGitRepository(skillDir: string): string | null {
  if (gitRepoCache.has(skillDir)) {
    return gitRepoCache.get(skillDir) ?? null;
  }

  const repository = runGit(skillDir, ['config', '--get', 'remote.origin.url']);
  gitRepoCache.set(skillDir, repository);
  return repository;
}

function readGitAuthor(skillDir: string, filePath: string): string | null {
  const fileKey = `${skillDir}|${filePath}`;
  if (gitAuthorCache.has(fileKey)) {
    return gitAuthorCache.get(fileKey) ?? null;
  }

  const relativeFilePath = relative(skillDir, filePath).replace(/\\/g, '/');
  const author =
    runGit(skillDir, ['log', '-1', '--format=%an', '--', relativeFilePath]) ??
    runGit(skillDir, ['log', '-1', '--format=%an']);

  gitAuthorCache.set(fileKey, author);
  return author;
}

function runGit(skillDir: string, args: string[]): string | null {
  try {
    const output = execFileSync('git', ['-C', skillDir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return output || null;
  } catch {
    return null;
  }
}

function readMetadataAuthor(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (isRecord(value) && typeof value.name === 'string') {
    return value.name;
  }

  return undefined;
}

function readMetadataRepository(parsed: Record<string, unknown>): string | undefined {
  return readRepositoryValue(parsed.repository) ?? readRepositoryValue(parsed.repo);
}

function readRepositoryValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (isRecord(value) && typeof value.url === 'string') {
    return value.url;
  }

  return undefined;
}

function truncateMetadataFiles(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).map(([fileName, content]) => [fileName, truncateText(content, 3000)]),
  );
}

function truncateText(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}\n...[truncated]`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getFallbackName(filePath: string): string {
  return basename(filePath) === 'SKILL.md' ? basename(dirname(filePath)) : basename(filePath);
}

function extractHeading(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function extractSectionTriggers(content: string, sectionName: string): string[] {
  const section = extractNamedSection(content, sectionName);
  return section ? extractBulletLines(section) : [];
}

function extractNamedSection(content: string, sectionName: string): string | null {
  const lines = content.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === `## ${sectionName}`);

  if (startIndex === -1) {
    return null;
  }

  const sectionLines: string[] = [];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.startsWith('## ')) {
      break;
    }

    sectionLines.push(line);
  }

  return sectionLines.join('\n').trim();
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '');
}
