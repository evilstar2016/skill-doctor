import { loadEffectiveScanSources, type EffectiveScanSource } from '../config/scanSources';
import type { SkillDoctorUserConfig } from '../config/loadUserConfig';
import { scanSkills } from '../discovery/scanSkills';
import { discoverMcpToolsForServers } from '../mcp/listMcpTools';
import { scanMcpServers } from '../mcp/scanMcpServers';
import type { ProvenanceCache } from '../parsing/provenanceCache';
import type { LlmExplainOptions } from '../types/explain';
import type { McpServerRecord } from '../types/mcp';
import type { SkillRecord } from '../types/skill';

export interface HealthCheckScanContext {
  config: SkillDoctorUserConfig;
  scanSources: EffectiveScanSource[];
  skills: SkillRecord[];
  mcpServers: McpServerRecord[];
  discoverMcpToolsForServers: (servers: McpServerRecord[]) => Promise<McpServerRecord[]>;
}

interface CreateHealthCheckScanContextOptions {
  projectDir: string;
  homeDir?: string;
  config: SkillDoctorUserConfig;
  extraPaths?: string[];
  llmOptions?: LlmExplainOptions;
  provenanceCache?: ProvenanceCache;
}

export async function createHealthCheckScanContext(
  options: CreateHealthCheckScanContextOptions,
): Promise<HealthCheckScanContext> {
  const scanSources = loadEffectiveScanSources(options.projectDir, {
    homeDir: options.homeDir,
    config: options.config,
  });
  const [skills, mcpServers] = await Promise.all([
    scanSkills(options.projectDir, {
      homeDir: options.homeDir,
      ...(options.provenanceCache ? { llmOptions: options.llmOptions, provenanceCache: options.provenanceCache } : {}),
      extraPaths: options.extraPaths,
      sources: scanSources,
    }),
    Promise.resolve(scanMcpServers(options.projectDir, {
      homeDir: options.homeDir,
      files: scanSources.filter((entry) => entry.resource === 'mcp' && entry.enabled).map((entry) => ({
        platform: entry.platform, scope: entry.scope, path: entry.resolvedPath, format: entry.format ?? 'json',
      })),
    })),
  ]);

  return {
    config: options.config,
    scanSources,
    skills,
    mcpServers,
    discoverMcpToolsForServers: createCachedMcpToolDiscovery(),
  };
}

function createCachedMcpToolDiscovery(): (servers: McpServerRecord[]) => Promise<McpServerRecord[]> {
  const cache = new Map<string, Promise<McpServerRecord>>();

  return async (servers) => Promise.all(servers.map(async (server) => {
    const key = JSON.stringify({
      transport: server.transport,
      command: server.command,
      args: server.args,
      url: server.url,
      envKeys: server.envKeys,
      headerKeys: server.headerKeys,
    });
    let discovered = cache.get(key);
    if (!discovered) {
      discovered = discoverMcpToolsForServers([server]).then(([result]) => result);
      cache.set(key, discovered);
    }
    const result = await discovered;
    return {
      ...server,
      toolDiscoveryStatus: result.toolDiscoveryStatus,
      ...(result.toolDiscoveryError ? { toolDiscoveryError: result.toolDiscoveryError } : {}),
      tools: result.tools,
    };
  }));
}
