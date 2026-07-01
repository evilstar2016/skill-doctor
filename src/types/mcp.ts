import type { Platform, Scope } from './skill';

export interface McpServerRecord {
  source: 'mcp';
  name: string;
  sourcePath: string;
  platform: Platform;
  scope: Scope;
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
}
