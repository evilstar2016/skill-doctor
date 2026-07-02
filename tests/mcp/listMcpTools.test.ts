import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { discoverMcpTools } from '../../src/mcp/listMcpTools';
import type { McpServerRecord } from '../../src/types/mcp';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tempRoots.length = 0;
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-doctor-mcp-list-'));
  tempRoots.push(root);
  return root;
}

function makeServer(overrides: Partial<McpServerRecord> = {}): McpServerRecord {
  return {
    source: 'mcp',
    name: 'test-server',
    sourcePath: '/fake/config.json',
    platform: 'claude',
    scope: 'project',
    args: [],
    envKeys: [],
    headerKeys: [],
    toolAllowlist: [],
    toolDenylist: [],
    ...overrides,
  };
}

function writeFile(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

describe('discoverMcpTools', () => {
  it('lists tools from a streamable HTTP MCP server', async () => {
    const server = createServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        const payload = JSON.parse(body) as { id?: number; method: string };
        response.setHeader('content-type', 'application/json');
        if (payload.method === 'initialize') {
          response.setHeader('mcp-session-id', 'session-1');
          response.end(JSON.stringify({
            jsonrpc: '2.0',
            id: payload.id,
            result: {
              protocolVersion: '2025-06-18',
              capabilities: { tools: {} },
              serverInfo: { name: 'test', version: '1.0.0' },
            },
          }));
          return;
        }
        if (payload.method === 'notifications/initialized') {
          response.statusCode = 202;
          response.end();
          return;
        }
        response.end(JSON.stringify({
          jsonrpc: '2.0',
          id: payload.id,
          result: {
            tools: [{
              name: 'search_docs',
              title: 'Search Docs',
              description: 'Search project documentation.',
              inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
            }],
          },
        }));
      });
    });

    try {
      const port = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          resolve((server.address() as AddressInfo).port);
        });
      });

      const result = await discoverMcpTools(makeServer({ url: `http://127.0.0.1:${port}/mcp` }));

      expect(result.toolDiscoveryStatus).toBe('ok');
      expect(result.tools).toEqual([
        expect.objectContaining({
          name: 'search_docs',
          description: 'Search project documentation.',
        }),
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('starts a stdio MCP server and lists tools', async () => {
    const root = tempRoot();
    const scriptPath = join(root, 'stdio-mcp.js');
    writeFile(
      scriptPath,
      [
        'const readline = require("node:readline");',
        'const rl = readline.createInterface({ input: process.stdin });',
        'rl.on("line", (line) => {',
        '  const msg = JSON.parse(line);',
        '  if (msg.method === "initialize") {',
        '    console.log(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "stdio-test", version: "1.0.0" } } }));',
        '  } else if (msg.method === "tools/list") {',
        '    console.log(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "summarize", description: "Summarize a file.", inputSchema: { type: "object" } }] } }));',
        '  }',
        '});',
      ].join('\n'),
    );

    const result = await discoverMcpTools(makeServer({
      command: process.execPath,
      args: [scriptPath],
    }));

    expect(result.toolDiscoveryStatus).toBe('ok');
    expect(result.tools?.[0]).toEqual(expect.objectContaining({
      name: 'summarize',
      description: 'Summarize a file.',
    }));
  });

  it('returns a failed status when a server cannot be reached', async () => {
    const result = await discoverMcpTools(makeServer({
      url: 'http://127.0.0.1:9/mcp',
      timeoutMs: 100,
    }));

    expect(result.toolDiscoveryStatus).toBe('failed');
    expect(result.toolDiscoveryError).toBeTruthy();
    expect(result.tools).toEqual([]);
  });
});
