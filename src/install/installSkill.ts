import { copyFileSync, createReadStream, existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { createHash } from 'node:crypto';

import type { Platform } from '../types/skill.js';
import { addRegistryEntry } from './registry.js';
import { resolveInstallPath } from './resolveInstallPath.js';

export interface InstallSkillOptions {
  source: string;
  platform: Platform;
  globalDir: string;
  layout: 'skill-dirs' | 'files';
  registryPath: string;
  link: boolean;
  sourceRef?: string;
  marketplaceSource?: boolean;
}

function extractSkillName(content: string, sourcePath: string): string {
  const match = content.match(/^name:\s*(.+)$/m);
  if (match) return match[1].trim().replace(/^['"]|['"]$/g, '');
  return basename(sourcePath) === 'SKILL.md'
    ? basename(dirname(sourcePath))
    : basename(sourcePath).replace(/\.(md|mdc)$/, '');
}

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(`sha256:${hash.digest('hex')}`));
    stream.on('error', reject);
  });
}

export async function installSkill(options: InstallSkillOptions): Promise<{ name: string; installedPath: string }> {
  const { readFileSync } = await import('node:fs');
  const content = readFileSync(options.source, 'utf8');
  const skillName = extractSkillName(content, options.source);

  const installedPath = resolveInstallPath(options.globalDir, options.layout, skillName);

  if (existsSync(installedPath)) {
    throw new Error(
      `Skill '${skillName}' already exists at ${installedPath}. Remove it first or use uninstall.`,
    );
  }

  mkdirSync(dirname(installedPath), { recursive: true });

  if (options.link) {
    symlinkSync(options.source, installedPath);
  } else {
    copyFileSync(options.source, installedPath);
  }

  const contentHash = await hashFile(installedPath);

  addRegistryEntry(options.registryPath, {
    name: skillName,
    platform: options.platform,
    scope: 'global',
    installedPath,
    installedAt: new Date().toISOString(),
    contentHash,
    source: options.marketplaceSource ? 'marketplace' : 'local',
    sourceRef: options.sourceRef ?? options.source,
  });

  return { name: skillName, installedPath };
}
