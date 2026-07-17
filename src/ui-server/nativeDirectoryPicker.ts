import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { zhMessage } from '../i18n';

const execFileAsync = promisify(execFile);

export interface NativeDirectoryCommandResult {
  stdout: string;
}

export type NativeDirectoryCommandRunner = (file: string, args: string[]) => Promise<NativeDirectoryCommandResult>;

export async function pickNativeDirectory(
  prompt: string,
  platform: NodeJS.Platform = process.platform,
  run: NativeDirectoryCommandRunner = execFileAsync,
): Promise<string | null> {
  try {
    if (platform === 'darwin') {
      const { stdout } = await run('/usr/bin/osascript', [
        '-e',
        `POSIX path of (choose folder with prompt "${prompt.replace(/"/g, '\\"')}")`,
      ]);
      return selectedPath(stdout);
    }

    if (platform === 'win32') {
      return await pickWindowsDirectory(prompt, run);
    }

    const { stdout } = await run('zenity', [
      '--file-selection',
      '--directory',
      `--title=${prompt}`,
    ]);
    return selectedPath(stdout);
  } catch (error) {
    if (isCancellation(error)) return null;
    throw new Error(zhMessage('error.directoryPicker', { error: error instanceof Error ? error.message : String(error) }));
  }
}

async function pickWindowsDirectory(prompt: string, run: NativeDirectoryCommandRunner): Promise<string | null> {
  // VBScript with Shell.Application.BrowseForFolder is more reliable than the
  // PowerShell Windows.Forms path on locked-down or minimal Windows installs:
  // it avoids Add-Type/.NET JIT, does not require STA, and uses the standard
  // shell folder browser that ships with every edition of Windows.
  const tempDir = mkdtempSync(join(tmpdir(), 'skill-doctor-'));
  const scriptPath = join(tempDir, 'pick-folder.vbs');
  const escapedPrompt = prompt.replace(/"/g, '""');
  const vbs = `Set objShell = CreateObject("Shell.Application")
Set folder = objShell.BrowseForFolder(0, "${escapedPrompt}", 0, "")
If Not folder Is Nothing Then WScript.Echo folder.Self.Path
`;
  try {
    // VBScript files must be UTF-16LE so non-ASCII prompts display correctly.
    writeFileSync(scriptPath, Buffer.from(`\ufeff${vbs}`, 'utf16le'));
    const { stdout } = await run('cscript.exe', ['//NoLogo', scriptPath]);
    return selectedPath(stdout);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function selectedPath(stdout: string): string | null {
  return stdout.trim() || null;
}

function isCancellation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: unknown; stderr?: unknown };
  return value.code === 1 || String(value.stderr ?? '').includes('User canceled') || String(value.stderr ?? '').includes('(-128)');
}
