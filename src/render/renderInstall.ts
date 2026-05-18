export function renderInstallSuccess(name: string, platform: string, installedPath: string): string {
  return [
    `✓ Installed '${name}' to ${platform}`,
    `  Path: ${installedPath}`,
    '',
  ].join('\n');
}

export function renderUninstallSuccess(name: string, platform: string): string {
  return `✓ Uninstalled '${name}' from ${platform}\n`;
}
