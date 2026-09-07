import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import {
  deleteSessionIndexEntries,
  loadSessionIndex,
  pruneSessionIndexEntries,
  saveSessionIndex,
  sanitizeAnalysisForIndex,
  type SessionIndexEntry,
} from '../../src/benefit/sessionIndex';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function entry(filePath: string, mtimeMs: number): SessionIndexEntry {
  return {
    filePath,
    archived: false,
    size: 10,
    mtimeMs,
    readOffset: 10,
    prefixHash: 'hash',
    analysis: {
      usageRecords: [],
      modelContexts: [],
      contextSnapshots: [{
        timestamp: '2026-09-07T00:00:00.000Z',
        full: true,
        agentsText: 'private rules',
        hostSkillsText: 'private skills',
        sourcePath: filePath,
        line: 2,
      }],
      cwdCandidates: [],
      workspaceRoots: [],
      observedEventTypes: [],
      events: { itemTypes: {}, toolCalls: 0, commandExecutions: 0, fileChanges: 0, mcpCalls: 0, compactions: 0, completedTurns: 0, failedTurns: 0, cancelledTurns: 0 },
      status: 'complete',
      diagnostics: [],
      bytes: 10,
      lineCount: 2,
    },
  };
}

describe('benefit session index retention and privacy', () => {
  it('strips context text while retaining a recoverable source reference', () => {
    const value = sanitizeAnalysisForIndex(entry('/tmp/session.jsonl', 100).analysis);
    expect(value.contextSnapshots[0]).toMatchObject({ sourcePath: '/tmp/session.jsonl', line: 2, agentsTextChars: 13, hostSkillsTextChars: 14 });
    expect(value.contextSnapshots[0]).not.toHaveProperty('agentsText');
    expect(value.contextSnapshots[0]).not.toHaveProperty('hostSkillsText');
  });

  it('prunes old metadata only when an explicit retention period is supplied', () => {
    const now = 10 * 86_400_000;
    const entries = [entry('/tmp/old.jsonl', now - 4 * 86_400_000), entry('/tmp/new.jsonl', now - 86_400_000)];
    expect(pruneSessionIndexEntries(entries, undefined, now)).toHaveLength(2);
    expect(pruneSessionIndexEntries(entries, 2, now).map((item) => item.filePath)).toEqual(['/tmp/new.jsonl']);
  });

  it('deletes selected index records without touching the source files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'skill-doctor-benefit-index-retention-'));
    roots.push(root);
    const indexPath = join(root, 'session-index.json');
    const sourceA = join(root, 'a.jsonl');
    const sourceB = join(root, 'b.jsonl');
    await saveSessionIndex(indexPath, [entry(sourceA, 1), entry(sourceB, 2)]);

    await expect(deleteSessionIndexEntries(indexPath, [sourceA])).resolves.toBe(1);
    const loaded = await loadSessionIndex(indexPath);
    expect(loaded?.entries.map((item) => item.filePath)).toEqual([sourceB]);
    expect(readFileSync(indexPath, 'utf8')).not.toContain('private rules');
  });
});
