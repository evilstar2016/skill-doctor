// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootstrapPayload } from '../../src/application/types';

const mocks = vi.hoisted(() => ({
  getTargetAgentSkills: vi.fn(),
  inspectSkillSource: vi.fn(),
  installSkill: vi.fn(),
  pickSkillSourceDirectory: vi.fn(),
  uninstallSkill: vi.fn(),
}));

vi.mock('../../web/src/api', () => mocks);

import { ManagePage } from '../../web/src/pages/ManagePage';

const bootstrap = {
  supportedPlatforms: ['claude'],
  registry: [],
} as unknown as BootstrapPayload;

describe('ManagePage skill selection', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.getTargetAgentSkills.mockResolvedValue({ targetPath: '/home/.claude/skills', scope: 'global', availableScopes: ['global', 'project'], skills: [] });
    mocks.installSkill.mockResolvedValue({ name: 'beta', installedPath: '/home/.claude/skills/beta/SKILL.md' });
    mocks.pickSkillSourceDirectory.mockResolvedValue({ cancelled: true });
  });

  it('previews a typed directory and installs only checked skills while showing target skills', async () => {
    mocks.getTargetAgentSkills.mockResolvedValue({
      targetPath: '/home/.claude/skills',
      scope: 'global', availableScopes: ['global', 'project'],
      skills: [{ name: 'alpha', sourcePath: '/home/.claude/skills/alpha/SKILL.md', managed: false, scope: 'global' }],
    });
    mocks.inspectSkillSource.mockResolvedValue({
      sourcePath: '/source',
      skills: [
        { id: '/source/alpha/SKILL.md', name: 'alpha', sourcePath: '/source/alpha/SKILL.md', relativePath: 'alpha/SKILL.md' },
        { id: '/source/beta/SKILL.md', name: 'beta', sourcePath: '/source/beta/SKILL.md', relativePath: 'beta/SKILL.md' },
      ],
    });
    const onChanged = vi.fn();

    render(<ManagePage bootstrap={bootstrap} snapshot={null} onChanged={onChanged} setToast={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('SKILL.md 或目录地址'), { target: { value: '/source' } });
    fireEvent.click(screen.getByRole('button', { name: '读取' }));

    const beta = await screen.findByText('beta');
    const alphaSource = screen.getAllByText('alpha').find((node) => node.closest('.skill-check-list'))!;
    expect(within(alphaSource.closest('label')!).getByRole('checkbox')).toHaveProperty('disabled', true);
    fireEvent.click(within(beta.closest('label')!).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '安装已选 (1)' }));

    await waitFor(() => expect(mocks.installSkill).toHaveBeenCalledWith({
      source: '/source/beta/SKILL.md', sourceType: 'local', target: 'claude', scope: 'global', link: false,
    }));
    expect(mocks.installSkill).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('uses the backend directory picker and installs only the checked disk path', async () => {
    mocks.getTargetAgentSkills.mockImplementation(async (_target, scope) => ({
      targetPath: scope === 'project' ? '/project/.claude/skills' : '/home/.claude/skills',
      scope, availableScopes: ['global', 'project'], skills: [],
    }));
    mocks.pickSkillSourceDirectory.mockResolvedValue({
      sourcePath: '/picked',
      skills: [
        { id: '/picked/alpha/SKILL.md', name: 'alpha', sourcePath: '/picked/alpha/SKILL.md', relativePath: 'alpha/SKILL.md' },
        { id: '/picked/beta/SKILL.md', name: 'beta', sourcePath: '/picked/beta/SKILL.md', relativePath: 'beta/SKILL.md' },
      ],
    });

    render(<ManagePage bootstrap={bootstrap} snapshot={null} onChanged={vi.fn()} setToast={vi.fn()} />);
    expect(screen.getByText('后端直接读取磁盘路径，不传输文件内容')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '选择本地来源目录' }));

    const betaName = await screen.findByText('beta');
    expect(mocks.pickSkillSourceDirectory).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('安装范围'), { target: { value: 'project' } });
    await waitFor(() => expect(screen.getByText(/项目安装目录/)).toBeTruthy());
    fireEvent.click(within(betaName.closest('label')!).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '安装已选 (1)' }));

    await waitFor(() => expect(mocks.installSkill).toHaveBeenCalledWith({
      source: '/picked/beta/SKILL.md',
      sourceType: 'local',
      target: 'claude',
      scope: 'project',
      link: false,
    }));
    expect(mocks.installSkill).toHaveBeenCalledTimes(1);
  });

  it('leaves the current source unchanged when the system directory picker is cancelled', async () => {
    render(<ManagePage bootstrap={bootstrap} snapshot={null} onChanged={vi.fn()} setToast={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '选择本地来源目录' }));

    await waitFor(() => expect(mocks.pickSkillSourceDirectory).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/操作未完成|不支持本地目录/)).toBeNull();
  });
});
