import { useCallback, useEffect, useState } from 'react';

import type { DoctorSnapshot } from '../../../src/application/types';
import type { SnapshotHistoryDiff, SnapshotHistoryEntry } from '../../../src/history/snapshotHistory';
import { diffSnapshots, getSnapshotHistory } from '../api';
import { PageHeading, StatCard } from '../components/ui';
import { useTranslation } from '../i18n';

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function HistoryPage({ snapshot }: { snapshot: DoctorSnapshot | null }) {
  const { t } = useTranslation();
  const [history, setHistory] = useState<SnapshotHistoryEntry[]>([]);
  const [baselineId, setBaselineId] = useState('');
  const [diff, setDiff] = useState<SnapshotHistoryDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getSnapshotHistory();
      setHistory(result.snapshots);
      setBaselineId((current) => current || result.snapshots[1]?.id || result.snapshots[0]?.id || '');
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, snapshot?.id]);

  const current = snapshot ?? history[0];
  const compare = async () => {
    if (!current || !baselineId) return;
    try {
      setDiff(await diffSnapshots(baselineId, current.id));
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  return <section>
    <PageHeading title={t('history.title')} subtitle={t('history.detail')} />
    {error && <p className="notice notice--danger">{error}</p>}
    {loading ? <p className="muted">{t('common.loading')}</p> : !history.length ? <div className="clean-state"><div><h3>{t('history.empty')}</h3><p>{t('history.emptyDetail')}</p></div></div> : <>
      <section className="panel">
        <div className="panel-heading"><div><h3>{t('history.compareTitle')}</h3><p>{current ? t('history.current', { time: formatTime(current.generatedAt) }) : t('history.noCurrent')}</p></div></div>
        <div className="filter-row">
          <select aria-label={t('history.baseline')} value={baselineId} onChange={(event) => { setBaselineId(event.target.value); setDiff(null); }}>
            {history.filter((entry) => entry.id !== current?.id).map((entry) => <option key={entry.id} value={entry.id}>{formatTime(entry.generatedAt)} · {entry.summary.issues} {t('history.issues')}</option>)}
          </select>
          <button className="button button--primary" onClick={() => void compare()} disabled={!current || !baselineId}>{t('history.compare')}</button>
        </div>
      </section>
      {diff && <div className="stats-grid">
        <StatCard label={t('history.newIssues')} value={diff.issues.added} detail={t('history.resolvedIssues', { count: diff.issues.resolved })} />
        <StatCard label={t('history.resources')} value={`${diff.resources.change >= 0 ? '+' : ''}${diff.resources.change}`} detail={t('history.fromTo', { before: diff.resources.baseline, after: diff.resources.current })} />
        <StatCard label={t('history.contextTokens')} value={`${diff.contextTokens.change >= 0 ? '+' : ''}${diff.contextTokens.change}`} detail={t('history.fromTo', { before: diff.contextTokens.baseline, after: diff.contextTokens.current })} />
      </div>}
      <section className="panel">
        <div className="panel-heading"><div><h3>{t('history.saved')}</h3><p>{t('history.retention')}</p></div></div>
        <div className="group-list">{history.map((entry) => <div className="group-row" key={entry.id}><span>{formatTime(entry.generatedAt)}</span><div>{entry.target.platform ?? t('history.crossAgent')}</div><strong>{entry.summary.issues} {t('history.issues')}</strong></div>)}</div>
      </section>
    </>}
  </section>;
}
