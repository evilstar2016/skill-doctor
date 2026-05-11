import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import type { SkillFile, SkillRecord } from '../types/skill';
import { extractBulletLines, uniqueStrings } from './extractTriggers';

interface FrontmatterData {
  name?: string;
  description?: string;
  applyTo?: string;
  globs: string[];
}

export function parseSkill(file: SkillFile): SkillRecord | null {
  const raw = readFileSync(file.filePath, 'utf8');

  if (!raw.trim()) {
    return null;
  }

  const { frontmatter, body } = splitFrontmatter(raw);
  const heading = extractHeading(body);
  const description =
    frontmatter.description ??
    extractNamedSection(body, 'Description')?.replace(/\s+/g, ' ').trim() ??
    body.trim().slice(0, 200);

  const triggers = uniqueStrings([
    ...extractSectionTriggers(body, 'When to Use'),
    ...extractSectionTriggers(body, 'Trigger'),
    ...frontmatter.globs,
    ...(frontmatter.applyTo ? [frontmatter.applyTo] : []),
    ...(frontmatter.description ? [frontmatter.description] : []),
  ]);

  return {
    name: frontmatter.name ?? heading ?? basename(file.filePath),
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
      frontmatter: { globs: [] },
      body: content,
    };
  }

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

  if (!match) {
    return {
      frontmatter: { globs: [] },
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
  const parsed: FrontmatterData = { globs: [] };
  let activeList: 'globs' | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith('- ') && activeList === 'globs') {
      parsed.globs.push(stripQuotes(trimmed.slice(2).trim()));
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
      activeList = 'globs';
      continue;
    }

    if (key === 'name') {
      parsed.name = stripQuotes(value);
    }

    if (key === 'description') {
      parsed.description = stripQuotes(value);
    }

    if (key === 'applyTo') {
      parsed.applyTo = stripQuotes(value);
    }
  }

  return parsed;
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