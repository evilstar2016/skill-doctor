import type { IncomingMessage, ServerResponse } from 'node:http';

export const BODY_LIMIT = 1024 * 1024;

export async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > BODY_LIMIT) throw new Error('Request body is too large.');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON body must be an object.');
  return parsed as Record<string, unknown>;
}

export function sendJson(response: ServerResponse, status: number, value: unknown): void {
  if (response.headersSent) {
    response.end();
    return;
  }
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
}

export function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value;
}

