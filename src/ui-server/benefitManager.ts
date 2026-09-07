import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { scanCodexSessions } from '../benefit/codexSessions';
import { estimateCodexBenefit } from '../benefit/estimateBenefit';
import { loadOptimizationPlan, validateOptimizationPlan } from '../benefit/optimizationPlan';
import { loadBenefitPriceTable } from '../benefit/prices';
import type { BenefitReport } from '../benefit/types';
import type { ContextTokenizerMode } from '../types/context';

export interface BenefitJobInput {
  projectDir: string;
  homeDir?: string;
  codexHome?: string;
  sinceMs: number;
  limit: number;
  includeArchived: boolean;
  planReference?: string;
  priceTablePath?: string;
  tokenizer: ContextTokenizerMode;
  tokenizerModel?: string;
}

export type BenefitStreamEvent =
  | { type: 'progress'; data: { phase: 'reading' | 'parsing' | 'associating' | 'simulating'; message: string; completed: number; total: number } }
  | { type: 'complete'; data: BenefitReport }
  | { type: 'error'; data: { message: string; code: string } }
  | { type: 'cancelled'; data: { message: string } };

interface BenefitSession {
  id: string;
  controller: AbortController;
  events: BenefitStreamEvent[];
  clients: Set<ServerResponse>;
  done: boolean;
}

export function positiveBenefitNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function positiveBenefitInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

export function parseBenefitJobInput(
  body: Record<string, unknown>,
  context: { projectDir: string; homeDir?: string },
): BenefitJobInput {
  const projectDir = resolve(typeof body.projectDir === 'string' && body.projectDir.trim() ? body.projectDir : context.projectDir);
  const sinceHours = positiveBenefitNumber(body.sinceHours) ?? 24;
  const limit = positiveBenefitInteger(body.limit) ?? 20;
  if (body.tokenizer !== undefined && body.tokenizer !== 'openai' && body.tokenizer !== 'approx') throw new Error('tokenizer must be openai or approx');
  const tokenizer: ContextTokenizerMode = body.tokenizer === 'approx' ? 'approx' : 'openai';
  const tokenizerModel = typeof body.tokenizerModel === 'string' && body.tokenizerModel.trim() ? body.tokenizerModel : undefined;
  const homeDir = context.homeDir ?? process.env.HOME ?? process.env.USERPROFILE ?? homedir();
  return {
    projectDir,
    homeDir,
    sinceMs: Date.now() - sinceHours * 60 * 60 * 1000,
    limit,
    includeArchived: body.includeArchived === true,
    ...(typeof body.plan === 'string' && body.plan.trim() ? { planReference: body.plan } : {}),
    tokenizer,
    ...(tokenizerModel ? { tokenizerModel } : {}),
  };
}

export async function runBenefitAnalysis(
  input: BenefitJobInput,
  signal?: AbortSignal,
  progress?: (event: BenefitStreamEvent['data']) => void,
): Promise<BenefitReport> {
  progress?.({ phase: 'reading', message: 'Reading Codex session files', completed: 0, total: 4 });
  const scan = await scanCodexSessions({
    projectDir: input.projectDir,
    ...(input.homeDir ? { homeDir: input.homeDir } : {}),
    ...(input.codexHome ? { codexHome: input.codexHome } : {}),
    sinceMs: input.sinceMs,
    limit: input.limit,
    includeArchived: input.includeArchived,
    useIndex: true,
    ...(signal ? { signal } : {}),
  });
  progress?.({ phase: 'parsing', message: 'Normalizing usage records and context snapshots', completed: 1, total: 4 });
  const loadedPlan = await loadOptimizationPlan({
    projectDir: input.projectDir,
    ...(input.homeDir ? { homeDir: input.homeDir } : {}),
    ...(input.planReference ? { reference: input.planReference } : {}),
  });
  if (input.planReference && !loadedPlan.plan) throw new Error(`Unable to load the requested optimization plan: ${input.planReference}`);
  progress?.({ phase: 'associating', message: 'Checking plan, project scope, and historical context evidence', completed: 2, total: 4 });
  const priceTable = await loadBenefitPriceTable(input.priceTablePath);
  const planValidation = loadedPlan.plan
    ? await validateOptimizationPlan({ plan: loadedPlan.plan, projectDir: input.projectDir, ...(input.homeDir ? { homeDir: input.homeDir } : {}) })
    : undefined;
  progress?.({ phase: 'simulating', message: 'Calculating Token and equivalent API-cost scenarios', completed: 3, total: 4 });
  const report = estimateCodexBenefit({
    scan,
    plan: loadedPlan.plan,
    planDiagnostics: loadedPlan.diagnostics,
    priceTable,
    tokenizer: input.tokenizer,
    ...(input.tokenizerModel ? { tokenizerModel: input.tokenizerModel } : {}),
    ...(planValidation ? { planValidation } : {}),
  });
  progress?.({ phase: 'simulating', message: 'Benefit report ready', completed: 4, total: 4 });
  return report;
}

export class BenefitManager {
  private readonly sessions = new Map<string, BenefitSession>();
  private activeId: string | null = null;

  start(input: BenefitJobInput): string {
    if (this.activeId) this.cancel(this.activeId);
    const id = randomUUID();
    const session: BenefitSession = { id, controller: new AbortController(), events: [], clients: new Set(), done: false };
    this.sessions.set(id, session);
    this.activeId = id;
    void this.run(session, input);
    return id;
  }

  subscribe(id: string, response: ServerResponse): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.clients.add(response);
    for (const event of session.events) writeSse(response, event);
    if (session.done) response.end();
    response.on('close', () => session.clients.delete(response));
    return true;
  }

  cancel(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session || session.done) return false;
    session.controller.abort();
    return true;
  }

  private async run(session: BenefitSession, input: BenefitJobInput): Promise<void> {
    try {
      const report = await runBenefitAnalysis(input, session.controller.signal, (data) => this.emit(session, { type: 'progress', data }));
      this.emit(session, { type: 'complete', data: report });
    } catch (error) {
      if (session.controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        this.emit(session, { type: 'cancelled', data: { message: 'Benefit analysis cancelled' } });
      } else {
        this.emit(session, { type: 'error', data: { message: error instanceof Error ? error.message : String(error), code: 'benefit_failed' } });
      }
    } finally {
      session.done = true;
      if (this.activeId === session.id) this.activeId = null;
      for (const client of session.clients) client.end();
      session.clients.clear();
      this.prune();
    }
  }

  private emit(session: BenefitSession, event: BenefitStreamEvent): void {
    session.events.push(event);
    for (const client of session.clients) writeSse(client, event);
  }

  private prune(): void {
    const completed = [...this.sessions.values()].filter((session) => session.done);
    for (const session of completed.slice(0, Math.max(0, completed.length - 5))) this.sessions.delete(session.id);
  }
}

function writeSse(response: ServerResponse, event: BenefitStreamEvent): void {
  response.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
}
