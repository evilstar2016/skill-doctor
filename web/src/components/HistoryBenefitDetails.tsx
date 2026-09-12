import type { OfflineHistoryAnalysis } from '../../../src/benefit/historyTypes';
import { useTranslation } from '../i18n';

const n = (value: number | undefined) => value === undefined ? '—' : value.toLocaleString();

export function HistoryBenefitDetails({ history, hideCandidates = false }: { history: OfflineHistoryAnalysis; hideCandidates?: boolean }) {
  const { t } = useTranslation();
  return <>
    {!hideCandidates && <details><summary>{t('benefit.historyCandidates')}</summary><div className="table-wrap"><table>
      <thead><tr><th>Skill / Plugin</th><th>{t('benefit.historyUsage')}</th><th>{t('benefit.historyControl')}</th></tr></thead>
      <tbody>{history.usageProfile.map((item, index) => <tr key={`${item.kind}:${item.id}:${index}`}>
        <td>{item.name}<small>{item.kind}</small></td>
        <td>{item.explicitMentionCount} / {item.activationCount} / {item.observedReadCount} / {item.usedSessionCount}<small>{item.lastUsedAt ?? '—'}</small></td>
        <td>{item.recommendation} / {item.control}<small>{item.reason}</small><small>{item.controlMethod}</small><details><summary>{t('benefit.historyEvidence')}</summary>{item.evidence.map((entry, i) => <div key={i}>{entry.kind}: {entry.sessionId} · {entry.sourcePath}:{entry.line}</div>)}</details></td>
      </tr>)}</tbody>
    </table></div></details>}
    <details><summary>{t('benefit.historyTurns')}</summary><div className="table-wrap"><table>
      <thead><tr><th>turn_id</th><th>{t('benefit.responses')}</th><th>I / C / W</th><th>D / R / B / U</th></tr></thead>
      <tbody>{history.turnBreakdown.map((turn) => <tr key={turn.turnId}><td>{turn.turnId}</td><td>{turn.responseCount}</td><td>{n(turn.inputTokens)} / {n(turn.cachedInputTokens)} / {n(turn.cacheWriteInputTokens)}</td><td>{n(turn.descriptionTokens)} / {n(turn.cachedReadSavings)} / {n(turn.cacheWriteSavings)} / {n(turn.ordinarySavings)} ({turn.unknownResponses} unknown)</td></tr>)}</tbody>
    </table></div></details>
    <details><summary>{t('benefit.historyCache')}</summary><div className="table-wrap"><table>
      <thead><tr><th>response_id</th><th>I / C / W</th><th>D / replay</th><th>min–max</th><th>R / B / U</th></tr></thead>
      <tbody>{history.responses.map((row) => <tr key={row.responseId}><td>{row.responseId}</td><td>{n(row.before.inputTokens)} / {n(row.before.cachedInputTokens)} / {n(row.before.cacheWriteInputTokens)}</td><td>{n(row.descriptionTokens)} / {n(row.replayTokens)}</td><td>{n(row.cacheAttribution?.lower)}–{n(row.cacheAttribution?.upper)}</td><td>{n(row.cacheAttribution?.cachedRead)} / {n(row.cacheAttribution?.cacheWrite)} / {n(row.cacheAttribution?.ordinary)}</td></tr>)}</tbody>
    </table></div></details>
  </>;
}
