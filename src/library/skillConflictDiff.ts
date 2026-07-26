import * as fs from 'node:fs';
import { join, relative } from 'node:path';

export interface SkillConflictDiffLine {
  type: 'context' | 'added' | 'removed';
  content: string;
  managedLine?: number;
  candidateLine?: number;
}

export interface SkillConflictDiffFile {
  path: string;
  added: number;
  deleted: number;
  lines: SkillConflictDiffLine[];
}

export interface SkillConflictDiff {
  files: SkillConflictDiffFile[];
  added: number;
  deleted: number;
}

export function diffSkillDirectories(managedRoot: string, candidateRoot: string): SkillConflictDiff {
  const managedFiles = readTextFiles(managedRoot);
  const candidateFiles = readTextFiles(candidateRoot);
  const paths = new Set([...managedFiles.keys(), ...candidateFiles.keys()]);
  const files = [...paths].sort().flatMap((path) => {
    const managed = managedFiles.get(path);
    const candidate = candidateFiles.get(path);
    if (managed && candidate && managed.equals(candidate)) return [];
    const lines = diffLines(toLines(managed), toLines(candidate));
    return {
      path,
      added: lines.filter((line) => line.type === 'added').length,
      deleted: lines.filter((line) => line.type === 'removed').length,
      lines,
    };
  }).filter((file) => file.added > 0 || file.deleted > 0);

  return {
    files,
    added: files.reduce((total, file) => total + file.added, 0),
    deleted: files.reduce((total, file) => total + file.deleted, 0),
  };
}

function readTextFiles(rootPath: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  visit(rootPath, rootPath, files);
  return files;
}

function visit(rootPath: string, currentPath: string, files: Map<string, Buffer>): void {
  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.skill-doctor') continue;
    const path = join(currentPath, entry.name);
    if (entry.isDirectory()) {
      visit(rootPath, path, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const content = fs.readFileSync(path);
    if (content.includes(0)) continue;
    files.set(relative(rootPath, path).split('\u005c').join('/'), content);
  }
}

function toLines(content: Buffer | undefined): string[] {
  if (!content) return [];
  const lines = content.toString('utf8').split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function diffLines(managed: string[], candidate: string[]): SkillConflictDiffLine[] {
  const rows = managed.length + 1;
  const columns = candidate.length + 1;
  const table = Array.from({ length: rows }, () => new Uint16Array(columns));
  for (let left = managed.length - 1; left >= 0; left--) {
    for (let right = candidate.length - 1; right >= 0; right--) {
      table[left][right] = managed[left] === candidate[right]
        ? table[left + 1][right + 1] + 1
        : Math.max(table[left + 1][right], table[left][right + 1]);
    }
  }

  const lines: SkillConflictDiffLine[] = [];
  let left = 0;
  let right = 0;
  while (left < managed.length || right < candidate.length) {
    if (left < managed.length && right < candidate.length && managed[left] === candidate[right]) {
      lines.push({ type: 'context', content: managed[left], managedLine: left + 1, candidateLine: right + 1 });
      left++; right++;
    } else if (right < candidate.length && (left === managed.length || table[left][right + 1] >= table[left + 1][right])) {
      lines.push({ type: 'added', content: candidate[right], candidateLine: right + 1 });
      right++;
    } else {
      lines.push({ type: 'removed', content: managed[left], managedLine: left + 1 });
      left++;
    }
  }
  return lines;
}
