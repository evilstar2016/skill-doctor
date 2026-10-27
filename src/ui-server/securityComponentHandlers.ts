import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiRequestContext } from './apiContext';
import { readJsonBody, sendJson, requiredString } from './apiPrimitives';
import { importSecurityReport, loadSecurityState, prepareSecurityTask, setSecurityEnabled, upstreamInfo, type SecurityMode } from '../security-component/component';

export async function handleSecurityComponentRoute(request: IncomingMessage, response: ServerResponse, url: URL, context: ApiRequestContext): Promise<boolean> {
  if (url.pathname !== '/api/security-component') return false;
  try {
    if (request.method === 'GET') sendJson(response, 200, { ...loadSecurityState(context.projectDir, context.homeDir), upstream: upstreamInfo(), target: context.projectDir });
    else if (request.method === 'POST') {
      const body = await readJsonBody(request);
      if (body.action === 'enable' && typeof body.enabled === 'boolean') sendJson(response, 200, setSecurityEnabled(context.projectDir, body.enabled, context.homeDir));
      else if (body.action === 'import') sendJson(response, 200, importSecurityReport(context.projectDir, body.report, context.homeDir));
      else if (body.action === 'prepare') sendJson(response, 200, { task: prepareSecurityTask(context.projectDir, body.mode as SecurityMode, requiredString(body.scope, 'scope'), requiredString(body.revision, 'revision'), body.designReportId === undefined ? undefined : requiredString(body.designReportId, 'designReportId'), context.homeDir) });
      else throw new Error('Invalid security component action.');
    } else sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Use GET or POST.' } });
  } catch (error) {
    sendJson(response, 400, { error: { code: 'invalid_security_component', message: error instanceof Error ? error.message : 'Invalid report.' } });
  }
  return true;
}
