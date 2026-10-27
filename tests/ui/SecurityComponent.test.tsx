// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SecurityComponent } from '../../web/src/components/SecurityComponent';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('enables explicitly and hands off a task without launching an Agent', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ enabled: false, reports: [], target: '/project' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ enabled: true, reports: [] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ task: 'Pinned audit task' }) });
  vi.stubGlobal('fetch', fetcher);
  render(<SecurityComponent />);
  await waitFor(() => expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(false));
  expect(screen.queryByText('生成 Agent 任务')).toBeNull();
  fireEvent.click(screen.getByRole('checkbox'));
  await screen.findByText('生成 Agent 任务');
  fireEvent.change(screen.getByLabelText('审计范围或设计文档'), { target: { value: 'design.md' } });
  fireEvent.change(screen.getByLabelText('目标代码版本'), { target: { value: 'abc123' } });
  fireEvent.click(screen.getByText('生成 Agent 任务'));
  await screen.findByDisplayValue('Pinned audit task');
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ action: 'prepare', mode: 'design', scope: 'design.md', revision: 'abc123' });
});
it('shows import failures and retains prior state', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ enabled: true, reports: [] }) }).mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { message: 'Invalid findings' } }) }));
  const { container } = render(<SecurityComponent />);
  await screen.findByText('生成 Agent 任务');
  const file = new File(['{}'], 'security-report.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => '{}' });
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  expect((await screen.findByRole('alert')).textContent).toContain('无法导入报告');
  expect(screen.getByText('已导入 0 份报告')).toBeTruthy();
});

it('replaces missing-route errors with a friendly retry and recovers', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: { message: 'API route not found.' } }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ enabled: false, reports: [] }) }));
  render(<SecurityComponent />);
  expect((await screen.findByRole('alert')).textContent).toContain('安全组件暂时不可用');
  expect(screen.queryByText(/API route not found/)).toBeNull();
  fireEvent.click(screen.getByText('重试'));
  await waitFor(() => expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(false));
  expect(screen.queryByRole('alert')).toBeNull();
});
it('does not expose network exception details', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('internal host:4173 stack trace')));
  render(<SecurityComponent />);
  expect((await screen.findByRole('alert')).textContent).toContain('安全组件暂时不可用');
  expect(screen.queryByText(/internal host/)).toBeNull();
});
