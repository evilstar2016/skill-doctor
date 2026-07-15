import { describe, expect, it, vi } from 'vitest';

import { pickNativeDirectory, type NativeDirectoryCommandRunner } from '../../src/ui-server/nativeDirectoryPicker';

describe('native directory picker', () => {
  it('uses the macOS folder dialog and returns the selected disk path', async () => {
    const run = vi.fn<NativeDirectoryCommandRunner>().mockResolvedValue({ stdout: '/Users/test/skills/\n' });

    await expect(pickNativeDirectory('darwin', run)).resolves.toBe('/Users/test/skills/');
    expect(run).toHaveBeenCalledWith('/usr/bin/osascript', expect.arrayContaining(['-e']));
  });

  it('treats closing the system dialog as cancellation', async () => {
    const run = vi.fn<NativeDirectoryCommandRunner>().mockRejectedValue({ code: 1, stderr: 'User canceled. (-128)' });

    await expect(pickNativeDirectory('darwin', run)).resolves.toBeNull();
  });

  it('reports an unavailable Linux directory picker', async () => {
    const run = vi.fn<NativeDirectoryCommandRunner>().mockRejectedValue(new Error('spawn zenity ENOENT'));

    await expect(pickNativeDirectory('linux', run)).rejects.toThrow('无法打开系统目录选择器');
  });
});
