import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

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
        `POSIX path of (choose folder with prompt "${prompt}")`,
      ]);
      return selectedPath(stdout);
    }

    if (platform === 'win32') {
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms',
        '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
        `$dialog.Description = "${prompt}"`,
        'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }',
      ].join('; ');
      const { stdout } = await run('powershell.exe', ['-NoProfile', '-STA', '-Command', script]);
      return selectedPath(stdout);
    }

    const { stdout } = await run('zenity', [
      '--file-selection',
      '--directory',
      `--title=${prompt}`,
    ]);
    return selectedPath(stdout);
  } catch (error) {
    if (isCancellation(error)) return null;
    throw new Error(`无法打开系统目录选择器：${error instanceof Error ? error.message : String(error)}`);
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
