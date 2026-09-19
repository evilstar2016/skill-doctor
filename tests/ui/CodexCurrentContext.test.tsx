// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CodexSkillCatalogReport } from '../../src/context/codexSkillCatalog';
import { CodexCurrentContext } from '../../web/src/pages/CodexCurrentContext';
import { loadCodexSkillCatalogs } from '../../web/src/api';

vi.mock('../../web/src/api', () => ({ loadCodexSkillCatalogs: vi.fn() }));
const report: CodexSkillCatalogReport = { diagnostics: [], sessions: [
  { sessionId: 'latest', timestamp: '2026-09-19T10:00:00Z', sourcePath: '/history/latest.jsonl', status: 'absent', tokens: 0, skills: [] },
  { sessionId: 'older', timestamp: '2026-09-18T10:00:00Z', sourcePath: '/history/older.jsonl', status: 'present', tokens: 155, skills: [{ name: 'plugin:writer', description: 'Observed description', sourcePath: '/missing/writer/SKILL.md' }] },
  { sessionId: 'fragment', timestamp: '2026-09-17T10:00:00Z', sourcePath: '/history/fragment.jsonl', status: 'unknown', skills: [] },
] };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(loadCodexSkillCatalogs).mockResolvedValue(report); });
afterEach(cleanup);
function page(onOptimize = vi.fn()) { return <CodexCurrentContext projectDir="/project" snapshot={null} onOptimize={onOptimize} openResource={vi.fn()} onToggle={vi.fn()} />; }

it('defaults to the latest session and distinguishes absent, observed and unknown catalogs', async () => {
  render(page());
  const select = await screen.findByRole('combobox', { name: '历史会话' });
  expect((select as HTMLSelectElement).value).toBe('latest');
  expect(screen.queryByText('plugin:writer')).toBeNull();
  fireEvent.change(select, { target: { value: 'older' } });
  expect(screen.getByText('plugin:writer')).toBeTruthy();
  expect(screen.getByText('/missing/writer/SKILL.md')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /审阅调整/ })).toBeNull();
  fireEvent.change(select, { target: { value: 'fragment' } });
  expect(screen.queryByText('plugin:writer')).toBeNull();
  expect(screen.getByText(/会话可能是继承／分页片段/)).toBeTruthy();
  expect(screen.getByText('— 个技能')).toBeTruthy();
});
it('keeps the optimization entry and explanation available without readable history', async () => {
  vi.mocked(loadCodexSkillCatalogs).mockResolvedValue({ sessions: [], diagnostics: [] });
  const onOptimize = vi.fn(); render(page(onOptimize));
  expect(await screen.findByText(/尚无可读取的当前项目历史会话/)).toBeTruthy();
  expect(screen.getByText('Codex 单个技能不支持项目级关闭')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '进入优化建议' }));
  expect(onOptimize).toHaveBeenCalledOnce();
});
it('reports read errors and permits retry without claiming skills are absent', async () => {
  vi.mocked(loadCodexSkillCatalogs).mockRejectedValueOnce(new Error('Cannot read history'));
  render(page());
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Cannot read history');
  expect(screen.queryByText(/尚无可读取/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '重新读取会话' }));
  expect(await screen.findByRole('combobox')).toBeTruthy();
});
