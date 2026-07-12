import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const IGNORED_ENTRY_NAMES = new Set(['.git', '.skill-doctor']);

interface TreeEntry {
  type: 'directory' | 'file' | 'symlink';
  path: string;
  mode: number;
  content?: Buffer;
  linkTarget?: string;
}

export interface SkillDirectoryInspection {
  rootPath: string;
  name: string;
  treeHash: string;
}

export class SkillDirectoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillDirectoryError';
  }
}

export function inspectSkillDirectory(sourcePath: string): SkillDirectoryInspection {
  const rootPath = resolveSkillRoot(sourcePath);
  const entries = collectTreeEntries(rootPath);
  const entryFile = entries.find((entry) => entry.path === 'SKILL.md');
  if (!entryFile || (entryFile.type !== 'file' && entryFile.type !== 'symlink')) {
    throw new SkillDirectoryError(`Skill directory must contain a file named SKILL.md: ${rootPath}`);
  }

  const skillFilePath = resolve(rootPath, 'SKILL.md');
  if (!fs.statSync(skillFilePath).isFile()) {
    throw new SkillDirectoryError(`Skill directory must contain a file named SKILL.md: ${rootPath}`);
  }

  return {
    rootPath,
    name: readSkillName(fs.readFileSync(skillFilePath, 'utf8'), rootPath),
    treeHash: hashEntries(entries),
  };
}

export function hashSkillDirectory(sourcePath: string): string {
  return inspectSkillDirectory(sourcePath).treeHash;
}

export function copySkillDirectory(sourcePath: string, destinationPath: string): void {
  const rootPath = resolveSkillRoot(sourcePath);
  copyDirectory(rootPath, destinationPath);
}

function resolveSkillRoot(sourcePath: string): string {
  const selectedPath = resolve(sourcePath);
  let selectedStat: fs.Stats;
  try {
    selectedStat = fs.lstatSync(selectedPath);
  } catch {
    throw new SkillDirectoryError(`Skill path does not exist: ${selectedPath}`);
  }

  if (selectedStat.isSymbolicLink()) {
    throw new SkillDirectoryError(`Skill root must not be a symbolic link: ${selectedPath}`);
  }

  if (selectedStat.isDirectory()) {
    return selectedPath;
  }

  if (selectedStat.isFile() && basename(selectedPath) === 'SKILL.md') {
    return dirname(selectedPath);
  }

  throw new SkillDirectoryError(`Expected a skill directory or SKILL.md file: ${selectedPath}`);
}

function collectTreeEntries(rootPath: string): TreeEntry[] {
  const rootRealPath = fs.realpathSync(rootPath);
  const entries: TreeEntry[] = [];
  collectDirectoryEntries(rootPath, rootPath, rootRealPath, entries);
  return entries;
}

function collectDirectoryEntries(
  rootPath: string,
  currentPath: string,
  rootRealPath: string,
  entries: TreeEntry[],
): void {
  const children = fs.readdirSync(currentPath).sort((left, right) => left.localeCompare(right));
  for (const childName of children) {
    if (IGNORED_ENTRY_NAMES.has(childName)) continue;

    const childPath = resolve(currentPath, childName);
    const relativePath = getRelativePath(rootPath, childPath);
    const stats = fs.lstatSync(childPath);

    if (stats.isSymbolicLink()) {
      const linkTarget = validateSymbolicLink(rootPath, rootRealPath, childPath);
      entries.push({ type: 'symlink', path: relativePath, mode: stats.mode & 0o777, linkTarget });
      continue;
    }

    if (stats.isDirectory()) {
      assertInsideRoot(rootRealPath, fs.realpathSync(childPath), childPath);
      entries.push({ type: 'directory', path: relativePath, mode: stats.mode & 0o777 });
      collectDirectoryEntries(rootPath, childPath, rootRealPath, entries);
      continue;
    }

    if (stats.isFile()) {
      entries.push({
        type: 'file',
        path: relativePath,
        mode: stats.mode & 0o777,
        content: fs.readFileSync(childPath),
      });
      continue;
    }

    throw new SkillDirectoryError(`Unsupported entry in skill directory: ${childPath}`);
  }
}

function validateSymbolicLink(rootPath: string, rootRealPath: string, linkPath: string): string {
  const linkTarget = fs.readlinkSync(linkPath);
  if (isAbsolute(linkTarget)) {
    throw new SkillDirectoryError(`Symbolic link escapes the skill root: ${linkPath}`);
  }

  assertInsideRoot(rootPath, resolve(dirname(linkPath), linkTarget), linkPath);
  try {
    assertInsideRoot(rootRealPath, fs.realpathSync(linkPath), linkPath);
  } catch (error) {
    if (error instanceof SkillDirectoryError) throw error;
    throw new SkillDirectoryError(`Symbolic link must resolve inside the skill root: ${linkPath}`);
  }
  return linkTarget;
}

function assertInsideRoot(rootPath: string, candidatePath: string, entryPath: string): void {
  const result = relative(rootPath, candidatePath);
  if (result === '..' || result.startsWith(`..${sep}`) || isAbsolute(result)) {
    throw new SkillDirectoryError(`Symbolic link escapes the skill root: ${entryPath}`);
  }
}

function getRelativePath(rootPath: string, entryPath: string): string {
  return relative(rootPath, entryPath).split(sep).join('/');
}

function hashEntries(entries: TreeEntry[]): string {
  const hash = createHash('sha256');
  writeHashValue(hash, 'skill-doctor-managed-skill-tree-v1');
  for (const entry of entries) {
    writeHashValue(hash, entry.type);
    writeHashValue(hash, entry.path);
    writeHashValue(hash, String(entry.mode));
    if (entry.type === 'file') {
      writeHashBuffer(hash, entry.content ?? Buffer.alloc(0));
    }
    if (entry.type === 'symlink') {
      writeHashValue(hash, entry.linkTarget ?? '');
    }
  }
  return `sha256:${hash.digest('hex')}`;
}

function writeHashValue(hash: ReturnType<typeof createHash>, value: string): void {
  writeHashBuffer(hash, Buffer.from(value));
}

function writeHashBuffer(hash: ReturnType<typeof createHash>, value: Buffer): void {
  hash.update(String(value.length));
  hash.update(':');
  hash.update(value);
}

function copyDirectory(sourcePath: string, destinationPath: string): void {
  const stats = fs.lstatSync(sourcePath);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new SkillDirectoryError(`Expected a normal skill directory: ${sourcePath}`);
  }

  fs.mkdirSync(destinationPath, { recursive: true });
  for (const childName of fs.readdirSync(sourcePath)) {
    if (IGNORED_ENTRY_NAMES.has(childName)) continue;

    const sourceChildPath = resolve(sourcePath, childName);
    const destinationChildPath = resolve(destinationPath, childName);
    const childStats = fs.lstatSync(sourceChildPath);

    if (childStats.isDirectory()) {
      copyDirectory(sourceChildPath, destinationChildPath);
      continue;
    }
    if (childStats.isFile()) {
      fs.copyFileSync(sourceChildPath, destinationChildPath);
      fs.chmodSync(destinationChildPath, childStats.mode & 0o777);
      continue;
    }
    if (childStats.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(sourceChildPath), destinationChildPath);
      continue;
    }
    throw new SkillDirectoryError(`Unsupported entry in skill directory: ${sourceChildPath}`);
  }
  fs.chmodSync(destinationPath, stats.mode & 0o777);
}

function readSkillName(content: string, rootPath: string): string {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const nameLine = frontmatter?.[1].match(/^name:\s*(.+?)\s*$/m);
  const name = nameLine ? stripQuotes(nameLine[1].trim()) : basename(rootPath);
  if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name)) {
    throw new SkillDirectoryError(`Invalid skill name '${name}' in ${resolve(rootPath, 'SKILL.md')}`);
  }
  return name;
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && ((value.startsWith('\"') && value.endsWith('\"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}
