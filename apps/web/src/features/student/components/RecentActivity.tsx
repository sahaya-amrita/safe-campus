import { useI18n } from '../../../i18n';
import { toDeliveryStatus, type CheckInEntry } from '../checkIn/checkInQueue';
import { Icon } from './Icon';
import { StateLabel } from './SubmissionCard';

/** Earlier check-ins from this device (the latest is shown above with its full track). */
export function RecentActivity({ entries, onRetry }: { entries: readonly CheckInEntry[]; onRetry: (key: string) => void }) {
  const { t, formatTime } = useI18n();
  const earlier = entries.slice(1);
  return (
    <section className="sc-section sc-activity" aria-labelledby="sc-activity-heading">
      <h2 id="sc-activity-heading" className="sc-h2">
        <Icon name="clock" />
        {t.activityHeading}
      </h2>
      {earlier.length === 0 ? (
        <p className="sc-empty">{t.activityEmpty}</p>
      ) : (
        <ul className="sc-activity-list">
          {earlier.map((entry) => {
            const state = toDeliveryStatus(entry);
            const isHelp = entry.payload.status === 'HELP_REQUESTED';
            return (
              <li key={entry.key} className="sc-activity-item" data-testid="activity-item" data-state={state}>
                <span className={`sc-activity-icon ${isHelp ? 'sc-kind--help' : 'sc-kind--safe'}`}>
                  <Icon name={isHelp ? 'hand' : 'check'} size={18} />
                </span>
                <div className="sc-activity-body">
                  <p className="sc-activity-title">
                    {isHelp ? t.statusNeedHelp : t.statusSafe}
                    <span className="sc-activity-time">{formatTime(entry.createdAt)}</span>
                  </p>
                  {entry.payload.note && <p className="sc-activity-note">{entry.payload.note}</p>}
                  <StateLabel status={state} className={`sc-chip sc-chip--${state}`} />
                </div>
                {entry.lifecycle === 'FAILED' && (
                  <button type="button" className="sc-btn sc-btn--ghost sc-btn--small" onClick={() => onRetry(entry.key)}>
                    {t.retry}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
