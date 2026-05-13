import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import type { SkillFile, SkillRecord } from '../types/skill';
import { extractBulletLines, uniqueStrings } from './extractTriggers';

interface FrontmatterData {
  name?: string;
  description?: string;
  when_to_use?: string;
  /** Official Claude field name; `globs` kept for backward compat */
  paths: string[];
  globs: string[];
  applyTo?: string;
}

interface ManifestData {
  name?: string;
  description?: string;
}

type ListField = 'globs' | 'paths';
type BlockScalarField = 'description' | 'when_to_use' | 'applyTo';
type BlockScalarStyle = 'folded' | 'literal';

export function parseSkill(file: SkillFile): SkillRecord | null {
  const raw = readFileSync(file.filePath, 'utf8');

  if (!raw.trim()) {
    return null;
  }

  const manifest = readSiblingManifest(file.filePath);
  const { frontmatter, body } = splitFrontmatter(raw);
  const heading = extractHeading(body);
  const description =
    frontmatter.description ??
    manifest.description ??
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
    ...(!frontmatter.description && manifest.description ? [manifest.description] : []),
  ]);

  return {
    name: frontmatter.name ?? manifest.name ?? heading ?? getFallbackName(file.filePath),
    sourcePath: file.filePath,
    platform: file.platform,
    scope: file.scope,
    description,
    triggers,
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

function readSiblingManifest(filePath: string): ManifestData {
  if (basename(filePath) !== 'SKILL.md') {
    return {};
  }

  const manifestPath = join(dirname(filePath), 'manifest.json');
  if (!existsSync(manifestPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
    };
  } catch {
    return {};
  }
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
