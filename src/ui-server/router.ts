import type { IncomingMessage, ServerResponse } from 'node:http';

import { sendJson } from './apiPrimitives';
import { createApiRequestContext, type ApiServerContext } from './apiContext';
import { handleConfigRoute } from './configHandlers';
import { handleLibraryRoute } from './libraryHandlers';
import { handleResourceRoute } from './resourceHandlers';
import { handleScanRoute } from './scanHandlers';

export async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  serverContext: ApiServerContext,
): Promise<void> {
  const context = createApiRequestContext(serverContext);
  for (const handler of [handleConfigRoute, handleScanRoute, handleLibraryRoute, handleResourceRoute]) {
    if (await handler(request, response, url, context)) return;
  }
  sendJson(response, 404, { error: { code: 'not_found', message: 'API route not found.' } });
}

