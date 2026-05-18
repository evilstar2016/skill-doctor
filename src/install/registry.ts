import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { InstallRegistry, RegistryEntry } from '../types/install.js';
import type { Platform } from '../types/skill.js';

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

export function addRegistryEntry(registryPath: string, entry: RegistryEntry): void {
  const registry = loadRegistry(registryPath);
  const index = registry.entries.findIndex(
    (e) => e.name === entry.name && e.platform === entry.platform,
  );
  if (index >= 0) {
    registry.entries[index] = entry;
  } else {
    registry.entries.push(entry);
  }
  saveRegistry(registryPath, registry);
}

export function removeRegistryEntry(registryPath: string, name: string, platform: Platform): void {
  const registry = loadRegistry(registryPath);
  registry.entries = registry.entries.filter(
    (e) => !(e.name === name && e.platform === platform),
  );
  saveRegistry(registryPath, registry);
}

export function findRegistryEntry(
  registryPath: string,
  name: string,
  platform: Platform,
): RegistryEntry | undefined {
  return loadRegistry(registryPath).entries.find(
    (e) => e.name === name && e.platform === platform,
  );
}
