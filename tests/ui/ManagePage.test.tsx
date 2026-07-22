// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootstrapPayload } from '../../src/application/types';

const mocks = vi.hoisted(() => ({
  getCenterSkills: vi.fn(),
  inspectSkillSource: vi.fn(),
  installSkill: vi.fn(),
  pickSkillSourceDirectory: vi.fn(),
  previewDeployment: vi.fn(),
  commitDeployment: vi.fn(),
  reclaimPhysicalAgentSkills: vi.fn(),
  removeSkill: vi.fn(),
  syncDeployment: vi.fn(),
  uninstallDeployment: vi.fn(),
}));

vi.mock('../../web/src/api', () => mocks);

import { ManagePage } from '../../web/src/pages/ManagePage';

const bootstrap = {
  supportedPlatforms: ['claude'],
  registry: [],
} as unknown as BootstrapPayload;

describe('ManagePage unified Skill Center', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
    mocks.getCenterSkills.mockResolvedValue({ skills: [], physical: [], importPlanId: 'plan-empty' });
    mocks.inspectSkillSource.mockResolvedValue({ sourcePath: '/source', skills: [] });
    mocks.installSkill.mockResolvedValue({ name: 'beta', installedPath: '/home/.claude/skills/beta/SKILL.md' });
    mocks.pickSkillSourceDirectory.mockResolvedValue({ cancelled: true });
    mocks.previewDeployment.mockResolvedValue({ planId: 'preview-plan' });
    mocks.commitDeployment.mockResolvedValue({ status: 200, outcomes: [] });
  mocks.reclaimPhysicalAgentSkills.mockResolvedValue({ planId: 'plan-empty', outcomes: [], needsRescan: false });
  mocks.removeSkill.mockResolvedValue({ removed: true, uninstalledDeployments: 0 });
  mocks.syncDeployment.mockResolvedValue({ status: 200 });
  mocks.uninstallDeployment.mockResolvedValue({ status: 200 });
  });

  it('loads the center and renders managed and physical rows', async () => {
    mocks.getCenterSkills.mockResolvedValue({
      skills: [{
        id: 'managed-a', name: 'alpha', sourceType: 'local', treeHash: 'sha256:a',
        addedAt: '2026-01-01', updatedAt: '2026-01-02', managed: true,
        installations: [{ deploymentId: 'd-a', platform: 'claude', scope: 'global', mode: 'copy', installedPath: '/home/.claude/skills/alpha/SKILL.md', status: 'synced', installedAt: '2026-01-01' }],
      }],
      physical: [{ id: 'phys-1', name: 'local-review', rootPath: '/home/.claude/skills/local-review', platform: 'claude', scope: 'global', status: 'new', managed: false }],
      importPlanId: 'plan-1',
    });

    render(<ManagePage bootstrap={bootstrap} snapshot={null} onChanged={vi.fn()} setToast={vi.fn()} />);

    expect(await screen.findByText('alpha')).toBeTruthy();
    expect(screen.getByText('local-review')).toBeTruthy();
    expect(screen.getByText('Claude synced')).toBeTruthy();
  });

  it('installs only the checked skills from an inspected directory', async () => {
    mocks.inspectSkillSource.mockResolvedValue({
      sourcePath: '/source',
      skills: [
        { id: '/source/alpha/SKILL.md', name: 'alpha', sourcePath: '/source/alpha/SKILL.md', relativePath: 'alpha/SKILL.md' },
        { id: '/source/beta/SKILL.md', name: 'beta', sourcePath: '/source/beta/SKILL.md', relativePath: 'beta/SKILL.md' },
      ],
    });
    const onChanged = vi.fn();

    render(<ManagePage bootstrap={bootstrap} snapshot={null} onChanged={onChanged} setToast={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '加入中心库' }));
    fireEvent.change(screen.getByLabelText('SKILL.md 或目录地址'), { target: { value: '/source' } });
    fireEvent.click(screen.getByRole('button', { name: '读取' }));

    const beta = await screen.findByText('beta');
    fireEvent.click(within(beta.closest('label')!).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '安装' }));

    await waitFor(() => expect(mocks.installSkill).toHaveBeenCalledTimes(1));
    expect(mocks.installSkill).toHaveBeenCalledWith({
      source: '/source/beta/SKILL.md', sourceType: 'local', target: 'claude', scope: 'global', link: false,
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it('reclaims a physical Agent skill into the center library', async () => {
    mocks.getCenterSkills.mockResolvedValue({
      skills: [],
      physical: [{ id: 'phys-1', name: 'local-review', rootPath: '/home/.claude/skills/local-review', platform: 'claude', scope: 'global', status: 'new', managed: false }],
      importPlanId: 'reclaim-plan',
    });
    mocks.reclaimPhysicalAgentSkills.mockResolvedValue({
      planId: 'reclaim-plan',
      outcomes: [{ candidateId: 'phys-1', status: 'linked' }],
      needsRescan: false,
    });
    const setToast = vi.fn();

    render(<ManagePage bootstrap={bootstrap} snapshot={null} onChanged={vi.fn()} setToast={setToast} />);
    const row = await screen.findByText('local-review');
    fireEvent.click(within(row.closest('.center-row')!).getByRole('button', { name: '收回' }));

    await waitFor(() => expect(mocks.reclaimPhysicalAgentSkills).toHaveBeenCalledWith({
      planId: 'reclaim-plan',
      target: 'claude',
      scope: 'global',
      decisions: [{ candidateId: 'phys-1', action: 'replace-with-link' }],
    }));
    expect(setToast).toHaveBeenCalledWith('已收回 1 个 skill');
  });

  it('bulk-uninstalls selected managed skills from all targets', async () => {
    mocks.getCenterSkills.mockResolvedValue({
      skills: [
        { id: 'a', name: 'alpha', sourceType: 'local', treeHash: 'sha256:a', addedAt: '2026-01-01', updatedAt: '2026-01-02', managed: true, installations: [{ deploymentId: 'd-a', platform: 'claude', scope: 'global', mode: 'copy', installedPath: '/home/.claude/skills/alpha/SKILL.md', status: 'synced', installedAt: '2026-01-01' }] },
        { id: 'b', name: 'beta', sourceType: 'local', treeHash: 'sha256:b', addedAt: '2026-01-01', updatedAt: '2026-01-02', managed: true, installations: [{ deploymentId: 'd-b', platform: 'claude', scope: 'global', mode: 'copy', installedPath: '/home/.claude/skills/beta/SKILL.md', status: 'synced', installedAt: '2026-01-01' }] },
      ],
      physical: [],
      importPlanId: 'plan-bulk',
    });

    render(<ManagePage bootstrap={bootstrap} snapshot={null} onChanged={vi.fn()} setToast={vi.fn()} />);
    const alpha = await screen.findByText('alpha');
    const beta = screen.getByText('beta');
    fireEvent.click(within(alpha.closest('.center-row')!).getByRole('checkbox'));
    fireEvent.click(within(beta.closest('.center-row')!).getByRole('checkbox'));

    fireEvent.click(screen.getByRole('button', { name: '卸载' }));

    await waitFor(() => expect(mocks.removeSkill).toHaveBeenCalledTimes(2));
    expect(mocks.uninstallDeployment).toHaveBeenCalledWith('d-a', true);
    expect(mocks.uninstallDeployment).toHaveBeenCalledWith('d-b', true);
    expect(mocks.removeSkill).toHaveBeenCalledWith('a', true);
    expect(mocks.removeSkill).toHaveBeenCalledWith('b', true);
  });

  it('resyncs a modified installation from the detail drawer', async () => {
    mocks.getCenterSkills.mockResolvedValue({
      skills: [{
        id: 'managed-a', name: 'alpha', sourceType: 'local', treeHash: 'sha256:a',
        addedAt: '2026-01-01', updatedAt: '2026-01-02', managed: true,
        installations: [{ deploymentId: 'd-a', platform: 'claude', scope: 'global', mode: 'copy', installedPath: '/home/.claude/skills/alpha/SKILL.md', status: 'modified', installedAt: '2026-01-01' }],
      }],
      physical: [],
      importPlanId: 'plan-sync',
    });
    const setToast = vi.fn();

    render(<ManagePage bootstrap={bootstrap} snapshot={null} onChanged={vi.fn()} setToast={setToast} />);
    const row = await screen.findByText('alpha');
    fireEvent.click(row.closest('.center-row')!);

    fireEvent.click(await screen.findByRole('button', { name: '同步' }));

    await waitFor(() => expect(mocks.syncDeployment).toHaveBeenCalledWith('d-a', true));
    expect(setToast).toHaveBeenCalledWith('已重新同步');
  });
});
