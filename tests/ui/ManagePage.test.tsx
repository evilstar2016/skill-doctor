// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootstrapPayload } from '../../src/application/types';

const mocks = vi.hoisted(() => ({
  getCenterSkills: vi.fn(),
  getManagedSkillConflictDiff: vi.fn(),
  inspectSkillSource: vi.fn(),
  installSkill: vi.fn(),
  pickSkillSourceDirectory: vi.fn(),
  previewDeployment: vi.fn(),
  commitDeployment: vi.fn(),
  getDeploymentTargets: vi.fn(),
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
    mocks.getManagedSkillConflictDiff.mockResolvedValue({
      managed: { name: 'review', rootPath: '/center/review' },
      candidate: { name: 'review', rootPath: '/home/.claude/skills/review', platform: 'claude', scope: 'global' },
      files: [{ path: 'SKILL.md', added: 1, deleted: 1, lines: [{ type: 'removed', content: 'Old instruction', managedLine: 1 }, { type: 'added', content: 'New instruction', candidateLine: 1 }] }],
      added: 1,
      deleted: 1,
    });
    mocks.inspectSkillSource.mockResolvedValue({ sourcePath: '/source', skills: [] });
    mocks.installSkill.mockResolvedValue({ name: 'beta', installedPath: '/home/.claude/skills/beta/SKILL.md' });
    mocks.pickSkillSourceDirectory.mockResolvedValue({ cancelled: true });
  mocks.previewDeployment.mockResolvedValue({ planId: 'preview-plan' });
  mocks.commitDeployment.mockResolvedValue({ status: 200, outcomes: [] });
  mocks.getDeploymentTargets.mockResolvedValue([]);
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
    expect(screen.getByRole('button', { name: '部署到 Agent' })).toBeTruthy();
  });

  it('shows physical candidates matched to a canonical managed skill', async () => {
    mocks.getCenterSkills.mockResolvedValue({
      skills: [{
        id: 'managed-a', name: 'alpha', sourceType: 'local', treeHash: 'sha256:a', addedAt: '2026-01-01', updatedAt: '2026-01-02', managed: true, installations: [],
        physicalCandidates: [{ id: 'phys-1', name: 'alpha', rootPath: '/project/.claude/skills/alpha', platform: 'claude', scope: 'project', status: 'new', managed: false }],
      }],
      physical: [],
      importPlanId: 'plan-1',
    });

    render(<ManagePage bootstrap={bootstrap} snapshot={null} onChanged={vi.fn()} setToast={vi.fn()} />);
    fireEvent.click(await screen.findByText('alpha'));

    expect(await screen.findByText('匹配的物理候选')).toBeTruthy();
    expect(screen.getByText('/project/.claude/skills/alpha')).toBeTruthy();
  });

  it('opens a side-by-side comparison for a matched physical copy', async () => {
    mocks.getCenterSkills.mockResolvedValue({
      skills: [{
        id: 'managed-a', name: 'alpha', sourceType: 'local', treeHash: 'sha256:a', addedAt: '2026-01-01', updatedAt: '2026-01-02', managed: true, installations: [],
        physicalCandidates: [{ id: 'phys-1', name: 'alpha', rootPath: '/project/.openclaw/skills/alpha', platform: 'openclaw', scope: 'global', status: 'identical-copy', managed: false }],
      }],
      physical: [],
      importPlanId: 'plan-1',
    });

    render(<ManagePage bootstrap={bootstrap} snapshot={null} onChanged={vi.fn()} setToast={vi.fn()} />);
    fireEvent.click(await screen.findByText('alpha'));
    fireEvent.click(screen.getByRole('button', { name: '对比版本' }));

    const dialog = await screen.findByRole('dialog');
    expect((await within(dialog).findAllByText('中心库版本')).length).toBe(2);
    expect((await within(dialog).findAllByText('当前 Agent 版本')).length).toBe(2);
    expect(within(dialog).getByText('Old instruction')).toBeTruthy();
    expect(within(dialog).getByText('New instruction')).toBeTruthy();
  });

  it('shows a read error instead of leaving the comparison loading forever', async () => {
    mocks.getManagedSkillConflictDiff.mockRejectedValueOnce(new Error('preview expired'));
    mocks.getCenterSkills.mockResolvedValue({
      skills: [],
      physical: [{ id: 'phys-conflict', name: 'review', rootPath: '/home/.claude/skills/review', platform: 'claude', scope: 'global', status: 'same-name-different-content', managed: false }],
      importPlanId: 'conflict-plan',
    });

    render(<ManagePage bootstrap={bootstrap} snapshot={null} onChanged={vi.fn()} setToast={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '处理冲突' }));
    expect(await screen.findByText(/无法读取差异：preview expired/)).toBeTruthy();
  });

  it('opens an explicit deployment dialog from a managed skill row', async () => {
    mocks.getCenterSkills.mockResolvedValue({
      skills: [{ id: 'managed-a', name: 'alpha', sourceType: 'local', treeHash: 'sha256:a', addedAt: '2026-01-01', updatedAt: '2026-01-02', managed: true, installations: [] }],
      physical: [],
      importPlanId: 'plan-1',
    });
    mocks.getDeploymentTargets.mockResolvedValue([
      { targetId: 'claude-global', platform: 'claude', scope: 'global', directory: '/home/.claude/skills' },
      { targetId: 'claude-project', platform: 'claude', scope: 'project', directory: '/project/.claude/skills' },
    ]);
    mocks.previewDeployment.mockResolvedValue({ planId: 'preview-plan', targets: [{ targetId: 'claude-project', state: 'available', installedPath: '/project/.claude/skills/alpha' }] });

    render(<ManagePage bootstrap={bootstrap} snapshot={null} onChanged={vi.fn()} setToast={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '部署到 Agent' }));
    const path = await screen.findByText('/home/.claude/skills');
    fireEvent.click(within(path.closest('.deployment-target-card')!).getByRole('button', { name: '项目' }));

    await waitFor(() => expect(mocks.previewDeployment).toHaveBeenCalledWith('managed-a', ['claude-project'], 'copy'));
  });

  it('removes the redundant add-to-center entry point', async () => {
    render(<ManagePage bootstrap={bootstrap} snapshot={null} onChanged={vi.fn()} setToast={vi.fn()} />);
    await screen.findByText('中心仓库');
    expect(screen.queryByRole('button', { name: '加入中心库' })).toBeNull();
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
    fireEvent.click(within(row.closest('.center-row')!).getByRole('button', { name: '纳管' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '纳管' }));

    await waitFor(() => expect(mocks.reclaimPhysicalAgentSkills).toHaveBeenCalledWith({
      planId: 'reclaim-plan',
      decisions: [{ candidateId: 'phys-1', action: 'replace-with-link' }],
    }));
    expect(setToast).toHaveBeenCalledWith('已收回 1 个 skill');
  });

  it('batch-adopts selected physical Agent skills', async () => {
    mocks.getCenterSkills.mockResolvedValue({
      skills: [],
      physical: [
        { id: 'phys-1', name: 'local-review', rootPath: '/home/.claude/skills/local-review', platform: 'claude', scope: 'global', status: 'new', managed: false },
        { id: 'phys-2', name: 'format-docs', rootPath: '/home/.claude/skills/format-docs', platform: 'claude', scope: 'global', status: 'new', managed: false },
      ],
      importPlanId: 'batch-plan',
    });
    mocks.reclaimPhysicalAgentSkills.mockResolvedValue({
      planId: 'batch-plan',
      outcomes: [{ candidateId: 'phys-1', status: 'linked' }, { candidateId: 'phys-2', status: 'linked' }],
      needsRescan: false,
    });

    render(<ManagePage bootstrap={bootstrap} snapshot={null} onChanged={vi.fn()} setToast={vi.fn()} />);
    const first = await screen.findByText('local-review');
    const second = screen.getByText('format-docs');
    fireEvent.click(within(first.closest('.center-row')!).getByRole('checkbox'));
    fireEvent.click(within(second.closest('.center-row')!).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '批量纳管' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '批量纳管' }));

    await waitFor(() => expect(mocks.reclaimPhysicalAgentSkills).toHaveBeenCalledWith({
      planId: 'batch-plan',
      decisions: [
        { candidateId: 'phys-1', action: 'replace-with-link' },
        { candidateId: 'phys-2', action: 'replace-with-link' },
      ],
    }));
  });

  it('requires an explicit resolution for same-name different-content conflicts', async () => {
    mocks.getCenterSkills.mockResolvedValue({
      skills: [],
      physical: [{ id: 'phys-conflict', name: 'review', rootPath: '/home/.claude/skills/review', platform: 'claude', scope: 'global', status: 'same-name-different-content', managed: false }],
      importPlanId: 'conflict-plan',
    });
    mocks.reclaimPhysicalAgentSkills.mockResolvedValue({
      planId: 'conflict-plan',
      outcomes: [{ candidateId: 'phys-conflict', status: 'linked' }],
      needsRescan: false,
    });

    render(<ManagePage bootstrap={bootstrap} snapshot={null} onChanged={vi.fn()} setToast={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '处理冲突' }));
    const dialog = await screen.findByRole('dialog');
    expect((await within(dialog).findAllByText('SKILL.md')).length).toBe(2);
    expect(within(dialog).getByText('New instruction')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('中心仓库中的新名称'), { target: { value: 'review-agent-copy' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '确认' }));

    await waitFor(() => expect(mocks.reclaimPhysicalAgentSkills).toHaveBeenCalledWith({
      planId: 'conflict-plan',
      decisions: [{ candidateId: 'phys-conflict', action: 'keep-separate-and-link', name: 'review-agent-copy' }],
    }));
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
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '卸载' }));

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
