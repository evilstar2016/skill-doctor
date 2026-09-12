import { existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { readJsonBody, sendJson } from './apiPrimitives';
import { parseBenefitJobInput, runBenefitAnalysis } from './benefitManager';
import type { ApiRequestContext } from './apiContext';
import { applyHistoryControl, previewHistoryControl, publicControlPreview, reportControlTarget, undoHistoryControl } from '../context/historyControls';

export async function handleBenefitRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: ApiRequestContext,
): Promise<boolean> {
  if (request.method === 'POST' && url.pathname === '/api/benefits/control') {
    const body = await readJsonBody(request);
    if (typeof body.jobId !== 'string') throw new Error('jobId is required.');
    const report = context.benefits.getReport(body.jobId);
    if (typeof body.undo === 'string') {
      if (body.confirmation !== body.undo) throw new Error('Undo confirmation is required.');
      sendJson(response, 200, undoHistoryControl(report.projectDir, body.undo, context.homeDir));
      return true;
    }
    if (typeof body.kind !== 'string' || typeof body.id !== 'string' || typeof body.enabled !== 'boolean') throw new Error('Invalid control request.');
    const target = reportControlTarget(report, report.projectDir, body.kind, body.id);
    const result = typeof body.confirmation === 'string'
      ? applyHistoryControl(report.projectDir, target, body.enabled, body.confirmation, context.homeDir)
      : publicControlPreview(previewHistoryControl(report.projectDir, target, body.enabled, context.homeDir));
    sendJson(response, 200, result);
    return true;
  }
  if (request.method === 'POST' && url.pathname === '/api/benefits/jobs') {
    let jobId: string | undefined;
    const cancelOnDisconnect = () => {
      if (!response.writableEnded && jobId) context.benefits.cancel(jobId);
    };
    request.once('aborted', cancelOnDisconnect);
    response.once('close', cancelOnDisconnect);
    try {
      const body = await readJsonBody(request);
      const input = parseBenefitJobInput(body, context);
      assertProjectDirectory(input.projectDir);
      jobId = context.benefits.start(input);
      sendJson(response, 202, { jobId });
      return true;
    } finally {
      request.off('aborted', cancelOnDisconnect);
      response.off('close', cancelOnDisconnect);
    }
  }

  const eventsMatch = url.pathname.match(/^\/api\/benefits\/jobs\/([^/]+)\/events$/);
  if (request.method === 'GET' && eventsMatch) {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Connection', 'keep-alive');
    if (!context.benefits.subscribe(eventsMatch[1], response)) sendJson(response, 404, { error: { code: 'benefit_not_found', message: 'Benefit analysis was not found.' } });
    return true;
  }

  const cancelMatch = url.pathname.match(/^\/api\/benefits\/jobs\/([^/]+)\/cancel$/);
  if (request.method === 'POST' && cancelMatch) {
    sendJson(response, context.benefits.cancel(cancelMatch[1]) ? 200 : 404, { cancelled: true });
    return true;
  }

  if (request.method !== 'POST' || url.pathname !== '/api/benefits') return false;
  const controller = new AbortController();
  const cancelOnDisconnect = () => {
    if (!response.writableEnded) controller.abort();
  };
  request.once('aborted', cancelOnDisconnect);
  response.once('close', cancelOnDisconnect);
  try {
    const body = await readJsonBody(request);
    const input = parseBenefitJobInput(body, context);
    assertProjectDirectory(input.projectDir);
    const report = await runBenefitAnalysis(input, controller.signal);
    sendJson(response, 200, report);
    return true;
  } finally {
    request.off('aborted', cancelOnDisconnect);
    response.off('close', cancelOnDisconnect);
  }
}

function assertProjectDirectory(projectDir: string): void {
  if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) throw new Error(`Project directory is not available: ${projectDir}`);
}
