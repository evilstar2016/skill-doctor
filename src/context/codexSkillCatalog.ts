import { scanCodexSessions } from '../benefit/codexSessions';
import { catalogEntries } from '../benefit/historyAnalysis';
import { readOptimizationHeader } from './optimization';
import { analyzeCodexContextBlocks } from './scanCodexContextBlocks';
import { createTokenCounter } from './tokenCounter';

export interface CodexSkillCatalog {
  sessionId: string;
  timestamp: string;
  sourcePath: string;
  version?: string;
  status: 'present' | 'absent' | 'unknown';
  tokens?: number;
  skills: Array<{ name: string; description: string; sourcePath?: string }>;
}

export interface CodexSkillCatalogReport {
  sessions: CodexSkillCatalog[];
  diagnostics: string[];
}

/** Historical initial headers, never a claim about the live session or filesystem. */
export async function readCodexSkillCatalogs(projectDir: string, homeDir?: string): Promise<CodexSkillCatalogReport> {
  const scan = await scanCodexSessions({ projectDir, homeDir, sinceMs: 0, limit: 20, exactProjectOnly: true, includeArchived: false, includeContext: false, useIndex: false });
  const counter = createTokenCounter({ preserveWhitespace: true });
  const sessions = scan.selected.map(({ session }): CodexSkillCatalog => {
    const header = readOptimizationHeader(session.filePath);
    const base = { sessionId: session.sessionId, timestamp: session.timestamp, sourcePath: session.filePath, version: header.version, skills: [] };
    if (!header.complete) return { ...base, status: 'unknown' };
    const text = header.kinds['host_skills.instructions'];
    if (text === undefined) return { ...base, status: 'absent', tokens: 0 };
    const analysis = analyzeCodexContextBlocks(text, { blockIds: ['skills_instructions'], evidenceLevel: 'runtime-item-observed' });
    if (!analysis.blocks.length || analysis.blocks.some((block) => !block.complete)) return { ...base, status: 'unknown' };
    const skills = analysis.blocks.flatMap((block) => {
      const entries = catalogEntries(block.text, 'skills_instructions');
      return (block.availableSkills ?? []).map((skill) => ({
        name: skill.name,
        description: skill.description.replace(/\s*\(file:\s*[^\n]+?\)\s*$/, ''),
        sourcePath: entries.find((entry) => entry.name === skill.name)?.sourcePath,
      }));
    });
    return { ...base, status: 'present', tokens: counter.count(text), skills };
  });
  return { sessions, diagnostics: scan.diagnostics.filter((item) => item.severity !== 'info').map((item) => item.message).slice(0, 10) };
}
