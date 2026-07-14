import type { IncomingMessage, ServerResponse } from 'node:http';

import { compareResources, executeDuplicateCleanup, getResourceDetail } from '../application/actions';
import { toggleCodexResource } from '../context/codexControls';
import { readJsonBody, requiredString, sendJson } from './apiPrimitives';
import type { ApiRequestContext } from './apiContext';
import { renderSnapshotDashboard } from './renderSnapshotDashboard';

export async function handleResourceRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: ApiRequestContext,
): Promise<boolean> {
  const resourceMatch = url.pathname.match(/^\/api\/resources\/(.+)$/);
  if (request.method === 'GET' && resourceMatch) {
    const snapshot = requireSnapshot(context);
    sendJson(response, 200, await getResourceDetail(snapshot, decodeURIComponent(resourceMatch[1]), {
      homeDir: context.homeDir,
      whenToUseCachePath: context.getWhenToUseCachePath(),
    }));
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/compare') {
    const snapshot = requireSnapshot(context);
    const body = await readJsonBody(request);
    sendJson(response, 200, await compareResources(
      snapshot,
      requiredString(body.leftId, 'leftId'),
      requiredString(body.rightId, 'rightId'),
      snapshot.target.projectDir,
      context.homeDir,
    ));
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/context/toggle') {
    const body = await readJsonBody(request);
    const result = await toggleCodexResource(
      context.scans.currentSnapshot?.target.projectDir ?? context.projectDir,
      requiredString(body.id, 'id'),
      body.enabled === true,
      { homeDir: context.homeDir },
    );
    sendJson(response, 200, result);
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/cleanup') {
    const snapshot = requireSnapshot(context);
    const body = await readJsonBody(request);
    sendJson(response, 200, executeDuplicateCleanup(
      snapshot,
      requiredString(body.issueId, 'issueId'),
      requiredString(body.removePath, 'removePath'),
      requiredString(body.confirmation, 'confirmation'),
    ));
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/export/dashboard') {
    const html = renderSnapshotDashboard(requireSnapshot(context));
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="skill-doctor-dashboard.html"');
    response.end(html);
    return true;
  }

  return false;
}

function requireSnapshot(context: ApiRequestContext) {
  if (!context.scans.currentSnapshot) throw new Error('Run a scan first.');
  return context.scans.currentSnapshot;
}

