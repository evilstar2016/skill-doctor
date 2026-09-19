import type { IncomingMessage, ServerResponse } from 'node:http';
import { realpathSync } from 'node:fs';
import { applyOptimization, optimizationOverview, previewOptimization, undoOptimization, verifyOptimization } from '../context/optimization';
import type { OptimizationPeriod, OptimizationTarget } from '../context/optimizationTypes';
import type { ApiRequestContext } from './apiContext';
import { readJsonBody, requiredString, sendJson } from './apiPrimitives';

export async function handleOptimizationRoute(request: IncomingMessage, response: ServerResponse, url: URL, context: ApiRequestContext): Promise<boolean> {
  if (request.method !== 'POST' || url.pathname !== '/api/optimization') return false;
  const body = await readJsonBody(request);
  const project = requiredString(body.projectDir, 'projectDir');
  // A browser cannot turn this endpoint into a writer for an arbitrary project.
  if (realpathSync(project) !== realpathSync(context.projectDir)) {
    sendJson(response, 400, { error: 'Open the UI for this project before optimizing it.' });
    return true;
  }
  let result: unknown;
  switch (body.action) {
    case 'overview': {
      const period: OptimizationPeriod = body.period === 'week' ? 'week' : 'month';
      result = await optimizationOverview(project, context.homeDir, period);
      break;
    }
    case 'preview': {
      const targets = Array.isArray(body.targets) ? body.targets as OptimizationTarget[] : [body.target as OptimizationTarget];
      result = await previewOptimization(project, requiredString(body.sessionId, 'sessionId'), targets, context.homeDir, body.enabled === true);
      break;
    }
    case 'apply': {
      const targets = Array.isArray(body.targets) ? body.targets as OptimizationTarget[] : [body.target as OptimizationTarget];
      result = await applyOptimization(project, requiredString(body.sessionId, 'sessionId'), targets, requiredString(body.confirmation, 'confirmation'), context.homeDir, body.enabled === true);
      break;
    }
    case 'verify': result = await verifyOptimization(project, requiredString(body.operationId, 'operationId'), context.homeDir); break;
    case 'undo':
      if (body.confirmation !== body.operationId) {
        sendJson(response, 400, { error: 'Undo confirmation is required.' });
        return true;
      }
      result = undoOptimization(project, requiredString(body.operationId, 'operationId'), context.homeDir); break;
    default: throw new Error('Unknown optimization action.');
  }
  sendJson(response, 200, result);
  return true;
}
