import type { Platform } from './skill.js';

export interface RegistryEntry {
  name: string;
  platform: Platform;
  scope: 'global';
  installedPath: string;
  installedAt: string;
  contentHash: string;
  source: 'local' | 'marketplace';
  sourceRef: string;
}

export interface InstallRegistry {
  version: 1;
  entries: RegistryEntry[];
}
