import { useCallback, useEffect, useState } from 'react';

import type { DoctorSnapshot } from '../../../src/application/types';
import type { SnapshotHistoryDiff, SnapshotHistoryEntry } from '../../../src/history/snapshotHistory';
import { diffSnapshots, getSnapshotHistory } from '../api';
import { PageHeading, StatCard, platformLabel, scopeLabel } from '../components/ui';
import { useTranslation } from '../i18n';

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function actionableIssueCount(snapshot: SnapshotHistoryEntry): number {
  return snapshot.issues.filter((issue) => issue.severity !== 'info').length;
}

function comparableSnapshots(current: SnapshotHistoryEntry | undefined, candidate: SnapshotHistoryEntry): boolean {
  if (!current || current.id === candidate.id) return false;
  if (current.target.projectDir !== candidate.target.projectDir || current.target.platform !== candidate.target.platform || current.target.scope !== candidate.target.scope) return false;
  if (Boolean(current.context) !== Boolean(candidate.context)) return false;
  if (current.context && candidate.context) {
    const currentTokenizer = current.context.summary.tokenizer;
    const candidateTokenizer = candidate.context.summary.tokenizer;
    if (currentTokenizer.mode !== candidateTokenizer.mode || currentTokenizer.model !== candidateTokenizer.model) return false;
    if (current.context.summary.budgetTokens !== candidate.context.summary.budgetTokens) return false;
  }
  return true;
}

export function HistoryPage({ snapshot }: { snapshot: DoctorSnapshot | null }) {
  const { t } = useTranslation();
  const scopeText = (value: SnapshotHistoryEntry['target']['scope']) => value === 'all' ? t('resources.allScopes') : scopeLabel(value, t);
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
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, snapshot?.id]);

  const current = snapshot ?? history[0];
  const baselines = history.filter((entry) => comparableSnapshots(current, entry));
  const incompatibleCount = history.filter((entry) => entry.id !== current?.id && !comparableSnapshots(current, entry)).length;
  const selectedBaselineId = baselines.some((entry) => entry.id === baselineId) ? baselineId : baselines[0]?.id ?? '';
  const baseline = baselines.find((entry) => entry.id === selectedBaselineId);
  const fixedContextDiff = diff?.fixedContextTokens ?? { baseline: baseline?.summary.fixedTokens ?? 0, current: current?.summary.fixedTokens ?? 0, change: (current?.summary.fixedTokens ?? 0) - (baseline?.summary.fixedTokens ?? 0) };
  const activationContextDiff = diff?.activationContextTokens ?? { baseline: baseline?.summary.activationTokens ?? 0, current: current?.summary.activationTokens ?? 0, change: (current?.summary.activationTokens ?? 0) - (baseline?.summary.activationTokens ?? 0) };

  useEffect(() => {
    setBaselineId((previous) => {
      const next = baselines.some((entry) => entry.id === previous) ? previous : baselines[0]?.id ?? '';
      if (previous && next !== previous) setDiff(null);
      return next;
    });
  }, [current?.id, history]);

  useEffect(() => { setDiff(null); }, [current?.id]);

  const compare = async () => {
    if (!current || !selectedBaselineId) return;
    try {
      setDiff(await diffSnapshots(selectedBaselineId, current.id));
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
          <select aria-label={t('history.baseline')} value={selectedBaselineId} disabled={!baselines.length} onChange={(event) => { setBaselineId(event.target.value); setDiff(null); }}>
            {baselines.map((entry) => <option key={entry.id} value={entry.id}>{formatTime(entry.generatedAt)} · {platformLabel(entry.target.platform ?? 'all')} · {scopeText(entry.target.scope)} · {actionableIssueCount(entry)} {t('history.issues')}</option>)}
          </select>
          <button className="button button--primary" onClick={() => void compare()} disabled={!current || !selectedBaselineId}>{t('history.compare')}</button>
        </div>
        {!baselines.length && <p className="muted history-comparison-note">{t('history.noComparable')}</p>}
        {baselines.length > 0 && incompatibleCount > 0 && <p className="muted history-comparison-note">{t('history.incompatibleCount', { count: incompatibleCount })}</p>}
      </section>
      {diff && <div className="stats-grid">
        <StatCard label={t('history.newIssues')} value={diff.issues.added} detail={t('history.resolvedIssues', { count: diff.issues.resolved })} />
        <StatCard label={t('history.resources')} value={`${diff.resources.change >= 0 ? '+' : ''}${diff.resources.change}`} detail={t('history.fromTo', { before: diff.resources.baseline, after: diff.resources.current })} />
        <StatCard label={t('history.fixedContextTokens')} value={`${fixedContextDiff.change >= 0 ? '+' : ''}${fixedContextDiff.change}`} detail={t('history.fromTo', { before: fixedContextDiff.baseline, after: fixedContextDiff.current })} />
        <StatCard label={t('history.activationTokens')} value={`${activationContextDiff.change >= 0 ? '+' : ''}${activationContextDiff.change}`} detail={t('history.fromTo', { before: activationContextDiff.baseline, after: activationContextDiff.current })} />
      </div>}
      <section className="panel">
        <div className="panel-heading"><div><h3>{t('history.saved')}</h3><p>{t('history.retention')}</p></div></div>
        <div className="group-list">{history.map((entry) => <div className="group-row" key={entry.id}><span>{formatTime(entry.generatedAt)}</span><div>{platformLabel(entry.target.platform ?? 'all')} · {scopeText(entry.target.scope)}</div><strong>{actionableIssueCount(entry)} {t('history.issues')}</strong></div>)}</div>
      </section>
    </>}
  </section>;
}
