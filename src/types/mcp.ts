import type { Platform, Scope } from './skill';

export interface McpServerRecord {
  id?: string;
  source: 'mcp';
  name: string;
  sourcePath: string;
  platform: Platform;
  scope: Scope;
  enabled?: boolean;
  instructions?: string;
  transport?: string;
  command?: string;
  args: string[];
  url?: string;
  envKeys: string[];
  headerKeys: string[];
  toolAllowlist: string[];
  toolDenylist: string[];
  approvalMode?: string;
  trusted?: boolean;
  timeoutMs?: number;
  toolDiscoveryStatus?: 'ok' | 'failed';
  toolDiscoveryError?: string;
  tools?: McpToolRecord[];
  context?: {
    resource?: 'agents' | 'skill' | 'mcp' | 'plugin' | 'memory';
    configSource?: string;
    enabled?: boolean;
    controllable?: boolean;
    controlPath?: string;
    controlMethod?: string;
    estimateStatus?: 'estimated' | 'unknown' | 'unsupported';
  };
}

export interface McpToolRecord {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: unknown;
}
