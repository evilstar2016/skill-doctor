import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { catalogEntries, userText } from '../benefit/historyAnalysis';
import type { OptimizationRecommendation } from './optimizationTypes';

/** Only explicit user references count as intent; injected catalogs never do. */
export async function optimizationRecommendations(paths: string[], start: Date, end: Date): Promise<Record<'skill-catalog' | 'plugins', OptimizationRecommendation>> {
  const mentions = { 'skill-catalog': new Map<string, number>(), plugins: new Map<string, number>() };
  let complete = paths.length > 0; let messages = 0; let calls = 0;
  for (const path of paths) {
    if ((await stat(path)).size > 64 * 1024 * 1024) { complete = false; continue; }
    const stream = createReadStream(path, { encoding: 'utf8' });
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    let ordinal = 0;
    const knownSkills = new Set<string>();
    const knownPlugins = new Set<string>();
    try {
      for await (const raw of lines) {
        if (!raw.trim()) continue;
        let item;
        try { item = JSON.parse(raw); } catch { complete = false; continue; }
        if (item.ordinal !== ordinal++) complete = false;
        const p = item.payload ?? {};
        if (item.type === 'session_meta' && (p.forked_from_id || p.parent_thread_id || p.history_base?.end_ordinal_exclusive > 0)) complete = false;
        if (item.type === 'compacted') complete = false;
        const kinds = p.internal_chat_message_metadata_passthrough?.content_item_kinds;
        if (Array.isArray(kinds) && Array.isArray(p.content)) kinds.forEach((kind, i) => {
          if (kind === 'host_skills.instructions') for (const entry of catalogEntries(p.content[i]?.text ?? '', 'skills_instructions')) knownSkills.add(entry.name);
          if (kind === 'plugins.recommendations') for (const entry of catalogEntries(p.content[i]?.text ?? '', 'recommended_plugins')) knownPlugins.add(entry.id);
        });
        const time = Date.parse(item.timestamp);
        if (!Number.isFinite(time)) { complete = false; continue; }
        if (time < start.getTime() || time > end.getTime()) continue;
        if (item.type === 'event_msg' && p.type === 'item_completed' && /skill|tool|function|mcp/i.test(p.item?.type ?? '')) calls++;
        // Legacy user events cannot prove absence when message provenance is missing.
        if (item.type === 'event_msg' && p.type === 'user_message') complete = false;
        if (item.type !== 'response_item') continue;
        // Tool ownership is not reliably recorded across Codex versions. Any call
        // prevents claiming non-use; repeated explicit intent can still be shown.
        if (['function_call', 'custom_tool_call', 'tool_call'].includes(p.type)) calls++;
        if (p.type !== 'message' || p.role !== 'user') continue;
        if (!Array.isArray(p.content)) { complete = false; continue; }
        const text = p.content.filter((part, i) => typeof part.text === 'string' && (!kinds || kinds[i] === 'text' || kinds[i] === 'user_prompt')).map((part) => part.text).join('\n');
        if (!text.trim()) continue;
        // Exclude quoted/code examples from explicit invocation evidence.
        const request = userText(text);
        messages++;
        const skills = new Set<string>(); const plugins = new Set<string>();
        for (const match of request.matchAll(/\[\$?([^\]]+)\]\(([^)]+)\)/g)) {
          if (/SKILL\.md(?:$|#)|^skill:\/\//i.test(match[2])) skills.add(match[1].replace(/^\$/, ''));
          if (/^(?:plugin|app):\/\//.test(match[2])) plugins.add(match[2]);
        }
        for (const [known, found] of [[knownSkills, skills], [knownPlugins, plugins]]) {
          for (const name of known) {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (new RegExp(`(^|[^\\p{L}\\p{N}_:/-])\\$?${escaped}(?=$|[^\\p{L}\\p{N}_:/-])`, 'iu').test(request)) found.add(name);
          }
        }
        for (const [target, values] of [['skill-catalog', skills], ['plugins', plugins]] as const) {
          for (const value of values) mentions[target].set(value, (mentions[target].get(value) ?? 0) + 1);
        }
      }
    } finally { lines.close(); stream.destroy(); }
  }
  const result = (target: 'skill-catalog' | 'plugins'): OptimizationRecommendation => {
    const explicitRequests = Math.max(0, ...mentions[target].values());
    const reason = explicitRequests >= 2 ? 'explicit-repeat' : complete && messages > 0 && calls === 0 && explicitRequests === 0 ? 'no-observed-use' : 'insufficient-evidence';
    return { reason, explicitRequests, sessions: paths.length, messages };
  };
  return { 'skill-catalog': result('skill-catalog'), plugins: result('plugins') };
}
