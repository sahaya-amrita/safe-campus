import { useI18n } from '../../../i18n';
import type { CheckInEntry } from '../checkIn/checkInQueue';
import { SubmissionCard } from './SubmissionCard';

export function SubmissionHistory({ entries, onRetry }: { entries: readonly CheckInEntry[]; onRetry: (key: string) => void }) {
  const { t } = useI18n();
  const earlier = entries.slice(1);
  return (
    <section aria-labelledby="sc-history-heading" className="sc-section">
      <details>
        <summary>
          <h2 id="sc-history-heading" className="sc-inline-heading">
            {t.historyHeading} ({earlier.length})
          </h2>
        </summary>
        {earlier.length === 0 ? (
          <p className="sc-small">{t.historyEmpty}</p>
        ) : (
          <ul className="sc-list">
            {earlier.map((entry) => (
              <li key={entry.key}>
                <SubmissionCard entry={entry} onRetry={onRetry} />
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
