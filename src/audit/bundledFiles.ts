import { closeSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

// Compiled, packed or otherwise opaque artifacts that the text rules cannot read.
const OPAQUE_EXTENSIONS = new Set([
  '.pyc', '.pyo', '.pyd', '.pyz', '.whl', '.egg', '.so', '.dylib', '.dll', '.exe', '.class', '.jar', '.node', '.wasm',
]);

// Source files whose text the audit rules can read.
const SCRIPT_EXTENSIONS = new Set([
  '.py', '.sh', '.bash', '.zsh', '.js', '.mjs', '.cjs', '.ts', '.rb', '.pl', '.php', '.ps1', '.bat', '.cmd',
]);

// Large dependency or VCS trees: skipped unless the caller opts in, but always reported.
const HEAVY_DIRECTORIES = new Set(['.git', '.skill-doctor', 'node_modules']);

export const MAX_SCRIPT_BYTES = 1_000_000;

export interface UnscannedEntry {
  path: string;
  reason: 'oversized' | 'directory-link';
}

export interface BundledFiles {
  opaque: string[]; // compiled or startup-executed code, relative paths
  scripts: string[]; // readable script sources, relative paths
  unscanned: UnscannedEntry[]; // content the audit could not read
  skippedDirectories: string[]; // heavy directories not entered
}

export interface CollectOptions {
  includeHeavyDirectories?: boolean;
}

export function collectBundledFiles(root: string, options: CollectOptions = {}): BundledFiles {
  const found: BundledFiles = { opaque: [], scripts: [], unscanned: [], skippedDirectories: [] };
  const deferred: Array<{ dir: string; prefix: string }> = [];

  function classify(path: string, relativePath: string, name: string): void {
    const extension = extname(name).toLowerCase();
    if (OPAQUE_EXTENSIONS.has(extension) || hasBinarySignature(path)) {
      found.opaque.push(relativePath);
    } else if (extension === '.pth' || SCRIPT_EXTENSIONS.has(extension)) {
      if (sizeOf(path) > MAX_SCRIPT_BYTES) found.unscanned.push({ path: relativePath, reason: 'oversized' });
      else if (extension === '.pth') {
        // site.py executes any .pth line that starts with "import" at interpreter startup.
        if (/^import[ \t]/m.test(readText(path))) found.opaque.push(relativePath);
      } else found.scripts.push(relativePath);
    }
  }

  function walk(dir: string, prefix: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      let kind: 'file' | 'directory' | undefined = entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : undefined;

      if (entry.isSymbolicLink()) {
        try {
          const target = statSync(path);
          if (target.isDirectory()) {
            // Never follow directory links: they can escape the skill or loop.
            found.unscanned.push({ path: relativePath, reason: 'directory-link' });
            continue;
          }
          if (target.isFile()) kind = 'file';
        } catch {
          continue; // dangling link: nothing to run
        }
      }

      if (kind === 'directory') {
        if (!HEAVY_DIRECTORIES.has(entry.name)) walk(path, relativePath);
        else if (options.includeHeavyDirectories) deferred.push({ dir: path, prefix: relativePath });
        else found.skippedDirectories.push(relativePath);
      } else if (kind === 'file') {
        classify(path, relativePath, entry.name);
      }
    }
  }

  walk(root, '');
  // Heavy directories go last so their volume cannot mask findings elsewhere in the skill.
  for (let next = deferred.shift(); next; next = deferred.shift()) walk(next.dir, next.prefix);
  return found;
}

function sizeOf(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function readText(path: string): string {
  try {
    return readFileSync(path, 'latin1');
  } catch {
    return '';
  }
}

// Detects ELF, Mach-O (incl. universal), WebAssembly, Java class and Python 3.7+ bytecode by header,
// so renaming or stripping the extension does not hide them.
function hasBinarySignature(path: string): boolean {
  const header = Buffer.alloc(8);
  let fd: number | undefined;
  try {
    fd = openSync(path, 'r');
    if (readSync(fd, header, 0, 8, 0) < 8) return false;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  const magic = header.readUInt32BE(0);
  if ([0x7f454c46, 0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0x0061736d].includes(magic)) return true;
  const isPythonBytecode = header[2] === 0x0d && header[3] === 0x0a && header[5] === 0 && header[6] === 0 && header[7] === 0;
  return isPythonBytecode;
}
