import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';

import { runHealthCheck } from '../application/runHealthCheck';
import type { DoctorSnapshot, HealthCheckOptions, ScanProgressEvent } from '../application/types';
import { saveSnapshotHistory } from '../history/snapshotHistory';

export type ScanStreamEvent =
  | { type: 'progress'; data: ScanProgressEvent }
  | { type: 'complete'; data: DoctorSnapshot }
  | { type: 'error'; data: { message: string; code: string } }
  | { type: 'cancelled'; data: { message: string } };

interface ScanSession {
  id: string;
  controller: AbortController;
  events: ScanStreamEvent[];
  clients: Set<ServerResponse>;
  done: boolean;
}

export class ScanManager {
  private readonly sessions = new Map<string, ScanSession>();
  private activeId: string | null = null;
  currentSnapshot: DoctorSnapshot | null = null;

  constructor(private readonly homeDir?: string) {}

  start(options: HealthCheckOptions): string {
    if (this.activeId) this.cancel(this.activeId);
    const id = randomUUID();
    const session: ScanSession = {
      id,
      controller: new AbortController(),
      events: [],
      clients: new Set(),
      done: false,
    };
    this.sessions.set(id, session);
    this.activeId = id;
    void this.run(session, { ...options, signal: session.controller.signal });
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

  private async run(session: ScanSession, options: HealthCheckOptions): Promise<void> {
    try {
      const snapshot = await runHealthCheck(options, (event) => this.emit(session, { type: 'progress', data: event }));
      this.currentSnapshot = snapshot;
      saveSnapshotHistory(snapshot, options.homeDir ?? this.homeDir);
      this.emit(session, { type: 'complete', data: snapshot });
    } catch (error) {
      if (session.controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        this.emit(session, { type: 'cancelled', data: { message: 'Scan cancelled' } });
      } else {
        this.emit(session, {
          type: 'error',
          data: { message: error instanceof Error ? error.message : String(error), code: 'scan_failed' },
        });
      }
    } finally {
      session.done = true;
      if (this.activeId === session.id) this.activeId = null;
      for (const client of session.clients) client.end();
      session.clients.clear();
      this.prune();
    }
  }

  private emit(session: ScanSession, event: ScanStreamEvent): void {
    session.events.push(event);
    for (const client of session.clients) writeSse(client, event);
  }

  private prune(): void {
    const completed = [...this.sessions.values()].filter((session) => session.done);
    for (const session of completed.slice(0, Math.max(0, completed.length - 5))) this.sessions.delete(session.id);
  }
}

function writeSse(response: ServerResponse, event: ScanStreamEvent): void {
  response.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
}
