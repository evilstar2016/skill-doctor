import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import type { McpServerRecord, McpToolRecord } from '../types/mcp';
import { getMcpPrivateConfig } from './scanMcpServers';

const MCP_PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_TOOL_LIST_PAGES = 20;

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

interface JsonObject {
  [key: string]: unknown;
}

export async function discoverMcpToolsForServers(servers: McpServerRecord[]): Promise<McpServerRecord[]> {
  return Promise.all(servers.map((server) => discoverMcpTools(server)));
}

export async function discoverMcpTools(server: McpServerRecord): Promise<McpServerRecord> {
  try {
    const tools = server.url
      ? await listToolsOverHttp(server)
      : await listToolsOverStdio(server);
    return {
      ...server,
      toolDiscoveryStatus: 'ok',
      tools,
    };
  } catch (error) {
    return {
      ...server,
      toolDiscoveryStatus: 'failed',
      toolDiscoveryError: error instanceof Error ? error.message : String(error),
      tools: [],
    };
  }
}

async function listToolsOverStdio(server: McpServerRecord): Promise<McpToolRecord[]> {
  if (!server.command) {
    throw new Error('No stdio command or HTTP URL configured.');
  }

  const privateConfig = getMcpPrivateConfig(server);
  const child = spawn(server.command, server.args, {
    env: { ...process.env, ...privateConfig.env },
    ...(privateConfig.cwd ? { cwd: privateConfig.cwd } : {}),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stderrChunks: string[] = [];
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderrChunks.push(String(chunk));
  });

  const rl = createInterface({ input: child.stdout });
  const pending = new Map<number, (response: JsonRpcResponse) => void>();
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed: JsonRpcResponse;
    try {
      parsed = JSON.parse(trimmed) as JsonRpcResponse;
    } catch {
      return;
    }
    if (typeof parsed.id === 'number') {
      const resolve = pending.get(parsed.id);
      if (resolve) {
        pending.delete(parsed.id);
        resolve(parsed);
      }
    }
  });

  child.once('error', (error) => {
    for (const resolve of pending.values()) {
      resolve({ error: { message: error.message } });
    }
    pending.clear();
  });

  let nextId = 1;
  const timeoutMs = getTimeoutMs(server);

  try {
    await sendStdioRequest(child, pending, nextId++, 'initialize', buildInitializeParams(), timeoutMs);
    sendStdioNotification(child, 'notifications/initialized');
    const tools: McpToolRecord[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_TOOL_LIST_PAGES; page += 1) {
      const params = cursor ? { cursor } : {};
      const result = await sendStdioRequest(child, pending, nextId++, 'tools/list', params, timeoutMs);
      const pageResult = parseToolsListResult(result);
      tools.push(...pageResult.tools);
      cursor = pageResult.nextCursor;
      if (!cursor) break;
    }
    return tools;
  } finally {
    rl.close();
    child.kill();
    const exit = await waitForExit(child, 250);
    if (exit === 'running') {
      child.kill('SIGKILL');
    }
  }
}

function sendStdioNotification(child: ReturnType<typeof spawn>, method: string): void {
  if (!child.stdin) throw new Error('MCP stdio server stdin is unavailable.');
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
}

function sendStdioRequest(
  child: ReturnType<typeof spawn>,
  pending: Map<number, (response: JsonRpcResponse) => void>,
  id: number,
  method: string,
  params: unknown,
  timeoutMs: number,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!child.stdin) {
      reject(new Error('MCP stdio server stdin is unavailable.'));
      return;
    }
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for ${method}.`));
    }, timeoutMs);

    pending.set(id, (response) => {
      clearTimeout(timeout);
      if (response.error) {
        reject(new Error(response.error.message ?? `${method} failed.`));
      } else {
        resolve(response.result);
      }
    });

    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`, (error) => {
      if (error) {
        clearTimeout(timeout);
        pending.delete(id);
        reject(error);
      }
    });
  });
}

async function listToolsOverHttp(server: McpServerRecord): Promise<McpToolRecord[]> {
  if (!server.url) {
    throw new Error('No HTTP URL configured.');
  }

  const timeoutMs = getTimeoutMs(server);
  const privateConfig = getMcpPrivateConfig(server);
  let nextId = 1;

  const initialize = await sendHttpRequest(server.url, privateConfig.headers, nextId++, 'initialize', buildInitializeParams(), timeoutMs);
  const sessionId = initialize.sessionId;
  await sendHttpNotification(server.url, privateConfig.headers, sessionId, 'notifications/initialized', timeoutMs);

  const tools: McpToolRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_TOOL_LIST_PAGES; page += 1) {
    const params = cursor ? { cursor } : {};
    const response = await sendHttpRequest(server.url, privateConfig.headers, nextId++, 'tools/list', params, timeoutMs, sessionId);
    const pageResult = parseToolsListResult(response.result);
    tools.push(...pageResult.tools);
    cursor = pageResult.nextCursor;
    if (!cursor) break;
  }
  return tools;
}

async function sendHttpNotification(
  url: string,
  headers: Record<string, string>,
  sessionId: string | undefined,
  method: string,
  timeoutMs: number,
): Promise<void> {
  await fetchWithTimeout(url, {
    method: 'POST',
    headers: buildHttpHeaders(headers, sessionId),
    body: JSON.stringify({ jsonrpc: '2.0', method }),
  }, timeoutMs);
}

async function sendHttpRequest(
  url: string,
  headers: Record<string, string>,
  id: number,
  method: string,
  params: unknown,
  timeoutMs: number,
  sessionId?: string,
): Promise<{ result: unknown; sessionId?: string }> {
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: buildHttpHeaders(headers, sessionId),
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  }, timeoutMs);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from MCP server.`);
  }

  const nextSessionId = response.headers.get('mcp-session-id') ?? sessionId;
  const contentType = response.headers.get('content-type') ?? '';
  const body = await response.text();
  const rpcResponse = contentType.includes('text/event-stream')
    ? parseSseResponse(body, id)
    : JSON.parse(body) as JsonRpcResponse;

  if (rpcResponse.error) {
    throw new Error(rpcResponse.error.message ?? `${method} failed.`);
  }

  return { result: rpcResponse.result, sessionId: nextSessionId };
}

function buildHttpHeaders(headers: Record<string, string>, sessionId?: string): Record<string, string> {
  return {
    ...headers,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': MCP_PROTOCOL_VERSION,
    ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timed out connecting to MCP server at ${url}.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseSseResponse(body: string, expectedId: number): JsonRpcResponse {
  for (const event of body.split(/\n\n+/)) {
    const dataLines = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());
    if (dataLines.length === 0) continue;
    const parsed = JSON.parse(dataLines.join('\n')) as JsonRpcResponse;
    if (parsed.id === expectedId) return parsed;
  }
  throw new Error('MCP server returned SSE without a matching JSON-RPC response.');
}

function parseToolsListResult(result: unknown): { tools: McpToolRecord[]; nextCursor?: string } {
  if (!isObject(result) || !Array.isArray(result.tools)) {
    throw new Error('MCP server returned an invalid tools/list result.');
  }

  return {
    tools: result.tools
      .filter(isObject)
      .map((tool) => ({
        name: stringValue(tool.name) ?? 'unknown-tool',
        ...(stringValue(tool.title) ? { title: stringValue(tool.title) } : {}),
        ...(stringValue(tool.description) ? { description: stringValue(tool.description) } : {}),
        ...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {}),
        ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
      })),
    ...(stringValue(result.nextCursor) ? { nextCursor: stringValue(result.nextCursor) } : {}),
  };
}

function buildInitializeParams(): JsonObject {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: 'skill-doctor',
      version: '0.3.5',
    },
  };
}

function getTimeoutMs(server: McpServerRecord): number {
  return server.timeoutMs && server.timeoutMs > 0 ? server.timeoutMs : DEFAULT_TIMEOUT_MS;
}

function waitForExit(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<'exited' | 'running'> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.killed) {
      resolve('exited');
      return;
    }
    const timeout = setTimeout(() => resolve('running'), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve('exited');
    });
  });
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
