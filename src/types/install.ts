import type { Platform } from './skill.js';
import type { Scope } from './skill.js';

export interface RegistryEntry {
  name: string;
  platform: Platform;
  scope: Scope;
  installedPath: string;
  installedRootPath?: string;
  installedAt: string;
  contentHash: string;
  source: 'local' | 'marketplace';
  sourceRef: string;
}

export interface InstallRegistry {
  version: 1;
  entries: RegistryEntry[];
}
