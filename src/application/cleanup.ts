import { existsSync, rmSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import type { DoctorSnapshot } from './types';

export function executeDuplicateCleanup(
  snapshot: DoctorSnapshot,
  issueId: string,
  removePath: string,
  confirmation: string,
): { removedPath: string; removedContainer: string } {
  const issue = snapshot.issues.find((entry) => entry.id === issueId && entry.kind === 'duplicate');
  if (!issue) throw new Error('Duplicate issue not found in the current scan.');
  const allowedPaths = issue.evidence.flatMap((entry) => entry.path ? [resolve(entry.path)] : []);
  const selected = resolve(removePath);
  if (!allowedPaths.includes(selected)) throw new Error('The selected path is not part of this duplicate issue.');
  if (confirmation !== removePath) throw new Error('Confirmation must exactly match the selected path.');
  if (!existsSync(selected)) throw new Error(`Path no longer exists: ${selected}`);

  const target = basename(selected).toLowerCase() === 'skill.md' ? dirname(selected) : selected;
  rmSync(target, { recursive: true });
  return { removedPath: selected, removedContainer: target };
}

