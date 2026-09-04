import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const MULTI_PLATFORM_ADAPTER_PLATFORMS = [
  'claude',
  'cursor',
  'copilot',
  'codex',
  'gemini',
  'windsurf',
  'workbuddy',
  'infcode',
] as const;

export type MultiPlatformAdapterPlatform = typeof MULTI_PLATFORM_ADAPTER_PLATFORMS[number];

export function writeMultiPlatformProjectFixture(cwd: string, homeDir: string): void {
  writeFixtureFile(
    join(cwd, '.claude', 'skills', 'shared-review-helper', 'SKILL.md'),
    [
      '---',
      'name: shared-review-helper',
      'description: Review pull requests for authentication, authorization, input validation, regression risk, and merge readiness.',
      'when_to_use: Use when reviewing a TypeScript pull request before merge.',
      '---',
      '',
      '# Shared Review Helper',
    ].join('\n'),
  );

  writeFixtureFile(
    join(cwd, '.cursor', 'rules', 'shared-review-helper.mdc'),
    [
      '---',
      'name: shared-review-helper',
      'description: Review pull requests for authentication, authorization, input validation, regression risk, and merge readiness.',
      'globs: ["**/*.ts"]',
      '---',
      '',
      '# Cursor Shared Review Helper',
    ].join('\n'),
  );

  writeFixtureFile(
    join(cwd, '.github', 'instructions', 'copilot-security.instructions.md'),
    [
      '---',
      'name: copilot-security-review',
      'description: Review pull requests for authentication, authorization, input validation, and never return an API key in output.',
      'applyTo: "**/*.ts"',
      '---',
      '',
      '# Copilot Security Review',
    ].join('\n'),
  );

  writeFixtureFile(
    join(cwd, '.codex', 'skills', 'codex-review-guard', 'SKILL.md'),
    [
      '---',
      'name: codex-review-guard',
      'description: Review pull requests for authentication, authorization, input validation, regression risk, and merge readiness.',
      'when_to_use: Use before merging risky TypeScript changes.',
      '---',
      '',
      '# Codex Review Guard',
    ].join('\n'),
  );

  writeFixtureFile(
    join(cwd, '.gemini', 'skills', 'schema-change-guard', 'SKILL.md'),
    [
      '---',
      'name: schema-change-guard',
      'description: Review database migrations for rollback safety, destructive operations, and drop table risk.',
      'when_to_use: Use before applying a schema migration.',
      '---',
      '',
      '# Schema Change Guard',
    ].join('\n'),
  );

  writeFixtureFile(
    join(cwd, '.windsurf', 'rules', 'network-policy.md'),
    [
      '---',
      'name: windsurf-network-policy',
      'description: Review deployment notes before they upload to server or call a webhook endpoint.',
      'trigger: always_on',
      '---',
      '',
      '# Windsurf Network Policy',
    ].join('\n'),
  );

  writeFixtureFile(
    join(cwd, '.workbuddy', 'skills', 'workbuddy-review', 'SKILL.md'),
    [
      '---',
      'name: workbuddy-review',
      'description: Review WorkBuddy changes for regression risk and release readiness.',
      'when-to-use: Use before merging a WorkBuddy change.',
      '---',
      '',
      '# WorkBuddy Review',
    ].join('\n'),
  );

  writeFixtureFile(
    join(cwd, '.infcode', 'skills', 'infcode-review', 'SKILL.md'),
    [
      '---',
      'name: infcode-review',
      'description: Review InfCode changes for regression risk and release readiness.',
      '---',
      '',
      '# InfCode Review',
    ].join('\n'),
  );

  writeFixtureFile(
    join(homeDir, '.workbuddy', 'skills', 'workbuddy-review', 'SKILL.md'),
    [
      '---',
      'name: workbuddy-review',
      'description: Global WorkBuddy review fallback.',
      '---',
      '',
      '# Global WorkBuddy Review',
    ].join('\n'),
  );
  writeFixtureFile(
    join(homeDir, '.workbuddy', 'connectors', 'skills', 'connector-review', 'SKILL.md'),
    [
      '---',
      'name: connector-review',
      'description: Connector-provided WorkBuddy review helper.',
      'user-invocable: false',
      '---',
      '',
      '# Connector Review',
    ].join('\n'),
  );
  writeFixtureFile(
    join(homeDir, '.workbuddy', 'skills-marketplace', 'cached-only', 'SKILL.md'),
    [
      '---',
      'name: cached-only',
      'description: This cached skill must not be scanned.',
      '---',
      '',
      '# Cached Only',
    ].join('\n'),
  );
  for (const file of ['IDENTITY.md', 'USER.md', 'SOUL.md', 'MEMORY.md', 'BOOTSTRAP.md']) {
    writeFixtureFile(join(homeDir, '.workbuddy', file), `${file} fixture content.`);
  }

  writeMcpFixtures(cwd, homeDir);
}

function writeMcpFixtures(cwd: string, homeDir: string): void {
  const unreachableHttpServer = {
    type: 'http',
    url: 'http://127.0.0.1:1/mcp',
    timeout: 50,
    headers: { Authorization: 'Bearer hidden' },
    tools: ['search'],
  };

  writeFixtureFile(
    join(cwd, '.mcp.json'),
    JSON.stringify({ mcpServers: { claude_docs: unreachableHttpServer } }, null, 2),
  );

  writeFixtureFile(
    join(cwd, '.cursor', 'mcp.json'),
    JSON.stringify({ mcpServers: { cursor_docs: unreachableHttpServer } }, null, 2),
  );

  writeFixtureFile(
    join(cwd, '.vscode', 'mcp.json'),
    JSON.stringify({ mcpServers: { copilot_docs: unreachableHttpServer } }, null, 2),
  );

  writeFixtureFile(
    join(cwd, '.codex', 'config.toml'),
    [
      '[mcp_servers.codex_docs]',
      'type = "http"',
      'url = "http://127.0.0.1:1/mcp"',
      'timeout = 50',
      'tools = ["search"]',
    ].join('\n'),
  );

  writeFixtureFile(
    join(cwd, '.gemini', 'settings.json'),
    JSON.stringify({ mcpServers: { gemini_docs: unreachableHttpServer } }, null, 2),
  );

  writeFixtureFile(
    join(cwd, '.workbuddy', 'mcp.json'),
    JSON.stringify({ mcpServers: { workbuddy_docs: { type: 'http', url: 'http://127.0.0.1:1/mcp', timeout: 50 } } }, null, 2),
  );
  writeFixtureFile(
    join(cwd, '.infcode', 'mcpServers', 'mcp.json'),
    JSON.stringify({ mcpServers: { infcode_docs: { type: 'http', url: 'http://127.0.0.1:1/mcp', timeout: 50 } } }, null, 2),
  );
  writeFixtureFile(
    join(homeDir, '.workbuddy', 'mcp.json'),
    JSON.stringify({ mcpServers: { workbuddy_user_docs: { type: 'http', url: 'http://127.0.0.1:1/mcp', timeout: 50, headers: { Authorization: 'Bearer hidden-user-token' } } } }, null, 2),
  );
  writeFixtureFile(
    join(homeDir, '.workbuddy', 'connectors', 'default', 'mcp.json'),
    JSON.stringify({ mcpServers: { dynamic_connector_docs: { command: 'node' } } }, null, 2),
  );

  writeFixtureFile(join(homeDir, '.keep'), '');
}

function writeFixtureFile(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${content}\n`, 'utf8');
}
