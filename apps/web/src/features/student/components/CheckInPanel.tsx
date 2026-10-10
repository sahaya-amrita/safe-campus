import { useRef, useState } from 'react';
import { useI18n } from '../../../i18n';
import type { CheckInEntry } from '../checkIn/checkInQueue';
import type { UseCheckIns } from '../checkIn/useCheckIns';
import type { CreateCheckInRequest } from '../contracts/provisional';
import { HelpRequestForm } from './HelpRequestForm';
import { SubmissionCard } from './SubmissionCard';

interface Props {
  checkIns: UseCheckIns;
  geolocation?: Geolocation;
}

export function CheckInPanel({ checkIns, geolocation }: Props) {
  const { t, formatTime } = useI18n();
  const [helpOpen, setHelpOpen] = useState(false);
  const [repeatOf, setRepeatOf] = useState<CheckInEntry | null>(null);
  const latestRef = useRef<HTMLElement>(null);
  const { snapshot, submit, retry, submitting } = checkIns;
  const latest = snapshot.entries[0];

  const send = async (request: CreateCheckInRequest) => {
    const result = await submit(request);
    if (!result) return;
    setRepeatOf(result.kind === 'repeat-ignored' ? result.entry : null);
    setHelpOpen(false);
    // Move focus to the status so keyboard and screen-reader users hear the outcome.
    requestAnimationFrame(() => latestRef.current?.focus());
  };

  return (
    <section aria-labelledby="sc-checkin-heading" className="sc-section">
      <h2 id="sc-checkin-heading">{t.checkInHeading}</h2>
      <p className="sc-small">{t.checkInPrivacy}</p>

      {helpOpen ? (
        <HelpRequestForm
          onSubmit={(request) => void send(request)}
          onCancel={() => setHelpOpen(false)}
          disabled={submitting}
          geolocation={geolocation}
        />
      ) : (
        <div className="sc-actions">
          <button
            type="button"
            className="sc-button sc-button--safe sc-big"
            disabled={submitting || !snapshot.ready}
            onClick={() => void send({ status: 'SAFE' })}
          >
            <span aria-hidden="true">✓</span> {t.checkInSafe}
          </button>
          <button
            type="button"
            className="sc-button sc-button--help sc-big"
            disabled={!snapshot.ready}
            onClick={() => {
              setRepeatOf(null);
              setHelpOpen(true);
            }}
          >
            <span aria-hidden="true">!</span> {t.checkInNeedHelp}
          </button>
        </div>
      )}

      {repeatOf && (
        <p className="sc-notice" role="status">
          {t.duplicateIgnored(formatTime(repeatOf.createdAt))}
        </p>
      )}
      {snapshot.storageFailed && (
        <p className="sc-alert" role="alert">
          {t.storageFailed}
        </p>
      )}

      <div aria-live="polite" aria-atomic="true">
        {latest && (
          <SubmissionCard ref={latestRef} entry={latest} onRetry={retry} headingLevel="h3" heading={t.latestHeading} />
        )}
      </div>
    </section>
  );
}
