import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { createHash } from 'node:crypto';

import type { Platform, Scope } from '../types/skill.js';
import { addRegistryEntry } from './registry.js';
import { resolveInstallPath } from './resolveInstallPath.js';
import { copySkillDirectory, hashSkillDirectory } from '../library/skillDirectory.js';

export interface InstallSkillOptions {
  source: string;
  platform: Platform;
  globalDir: string;
  layout: 'skill-dirs' | 'files';
  scope?: Scope;
  registryPath: string;
  link: boolean;
  sourceRef?: string;
  marketplaceSource?: boolean;
}

export function extractSkillName(content: string, sourcePath: string): string {
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
  const content = readFileSync(options.source, 'utf8');
  const skillName = extractSkillName(content, options.source);

  if (/[/\\]/.test(skillName) || skillName === '..' || skillName === '.') {
    throw new Error(`Invalid skill name '${skillName}': must not contain path separators.`);
  }

  const installedPath = resolveInstallPath(options.globalDir, options.layout, skillName);
  const installedRootPath = options.layout === 'skill-dirs' ? dirname(installedPath) : installedPath;

  if (existsSync(installedRootPath)) {
    throw new Error(
      `Skill '${skillName}' already exists at ${installedPath}. Remove it first or use uninstall.`,
    );
  }

  const sourceDirectoryHash = options.layout === 'skill-dirs'
    ? hashSkillDirectory(dirname(options.source))
    : undefined;
  mkdirSync(options.layout === 'skill-dirs' ? dirname(installedRootPath) : dirname(installedPath), { recursive: true });

  if (options.layout === 'skill-dirs' && options.link) {
    symlinkSync(dirname(options.source), installedRootPath, 'dir');
  } else if (options.layout === 'skill-dirs') {
    copySkillDirectory(dirname(options.source), installedRootPath);
  } else if (options.link) {
    symlinkSync(options.source, installedPath);
  } else {
    copyFileSync(options.source, installedPath);
  }

  const contentHash = options.layout === 'skill-dirs'
    ? (options.link ? sourceDirectoryHash! : hashSkillDirectory(realpathSync(installedRootPath)))
    : await hashFile(installedPath);

  addRegistryEntry(options.registryPath, {
    name: skillName,
    platform: options.platform,
    scope: options.scope ?? 'global',
    installedPath,
    ...(options.layout === 'skill-dirs' ? { installedRootPath } : {}),
    installedAt: new Date().toISOString(),
    contentHash,
    source: options.marketplaceSource ? 'marketplace' : 'local',
    sourceRef: options.sourceRef ?? options.source,
  });

  return { name: skillName, installedPath };
}
