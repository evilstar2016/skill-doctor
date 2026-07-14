import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { fetchMarketplaceSkill } from '../install/fetchMarketplace';
import { installSkill } from '../install/installSkill';
import { resolveInstallTarget } from '../install/resolveInstallPath';
import { uninstallSkill } from '../install/uninstallSkill';
import type { Platform } from '../types/skill';
import { getRegistryPath } from './runtimePaths';

export interface InstallRequest {
  source: string;
  sourceType: 'local' | 'marketplace';
  target: string;
  link?: boolean;
  homeDir?: string;
}

export async function installManagedSkill(request: InstallRequest) {
  const target = resolveInstallTarget(request.target, { homeDir: request.homeDir });
  const registryPath = getRegistryPath(request.homeDir);

  if (request.sourceType === 'local') {
    let sourcePath = resolve(request.source);
    if (!existsSync(sourcePath)) throw new Error(`Path not found: ${request.source}`);
    if (statSync(sourcePath).isDirectory()) sourcePath = join(sourcePath, 'SKILL.md');
    if (!existsSync(sourcePath)) throw new Error(`SKILL.md not found: ${sourcePath}`);
    return installSkill({
      source: sourcePath,
      platform: target.platform,
      globalDir: target.globalDir,
      layout: target.layout,
      registryPath,
      link: request.link ?? false,
      sourceRef: sourcePath,
      marketplaceSource: false,
    });
  }

  const content = await fetchMarketplaceSkill(request.source);
  const tempDir = mkdtempSync(join(tmpdir(), 'skill-doctor-ui-install-'));
  const tempFile = join(tempDir, 'SKILL.md');
  try {
    writeFileSync(tempFile, content, 'utf8');
    return await installSkill({
      source: tempFile,
      platform: target.platform,
      globalDir: target.globalDir,
      layout: target.layout,
      registryPath,
      link: false,
      sourceRef: request.source,
      marketplaceSource: true,
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function uninstallManagedSkill(
  name: string,
  platform: Platform,
  force: boolean,
  homeDir?: string,
): Promise<void> {
  await uninstallSkill({ name, platform, force, registryPath: getRegistryPath(homeDir) });
}

