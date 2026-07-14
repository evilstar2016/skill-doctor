import { renderDashboard } from '../render/renderDashboard';
import type { DoctorSnapshot } from '../application/types';

export function renderSnapshotDashboard(snapshot: DoctorSnapshot): string {
  const duplicates = snapshot.conflicts.filter((pair) => pair.kind === 'duplicate');
  return renderDashboard({
    skills: snapshot.skills,
    conflicts: snapshot.conflicts.filter((pair) => pair.kind === 'conflict'),
    duplicates,
    suggestions: snapshot.issues.flatMap((issue) => issue.cleanup ? [issue.cleanup] : []),
    auditResult: {
      scanned: snapshot.audit.scanned,
      findings: snapshot.audit.findings,
      aiFindings: snapshot.audit.aiFindings,
      summary: snapshot.audit.summary,
    },
  });
}

