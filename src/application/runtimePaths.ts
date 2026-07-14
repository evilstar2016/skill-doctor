import { resolve } from 'node:path';

import { getDefaultWhenToUseCachePath } from '../explain/whenToUseCache';

export function getRegistryPath(homeDir?: string): string {
  const home = homeDir ?? process.env.HOME ?? process.env.USERPROFILE ?? '';
  return resolve(home, '.skill-doctor', 'registry.json');
}

export function getWhenToUseCachePath(homeDir?: string): string {
  return getDefaultWhenToUseCachePath(homeDir);
}
