import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { InstallRegistry } from '../types/install.js';

export function loadRegistry(registryPath: string): InstallRegistry {
  try {
    const raw = readFileSync(registryPath, 'utf8');
    return JSON.parse(raw) as InstallRegistry;
  } catch {
    return { version: 1, entries: [] };
  }
}

export function saveRegistry(registryPath: string, registry: InstallRegistry): void {
  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');
}

