import { forwardRef } from 'react';
import { useI18n, type Messages } from '../../../i18n';
import { toDeliveryState, type CheckInEntry } from '../checkIn/checkInQueue';
import type { DeliveryState } from '../contracts/provisional';

const STATE_LABEL: Record<DeliveryState, (t: Messages) => string> = {
  QUEUED_OFFLINE: (t) => t.stateQueuedOffline,
  PENDING: (t) => t.statePending,
  ACCEPTED: (t) => t.stateAccepted,
  FAILED: (t) => t.stateFailed,
};

const STATE_ICON: Record<DeliveryState, string> = {
  QUEUED_OFFLINE: '⏸',
  PENDING: '…',
  ACCEPTED: '✓',
  FAILED: '✕',
};

/** Exactly what is known about one check-in's delivery — never more. */
export function describeEntry(entry: CheckInEntry, t: Messages, formatTime: (iso: string) => string): string[] {
  switch (entry.lifecycle) {
    case 'QUEUED':
      switch (entry.problem) {
        case 'OFFLINE':
          return [t.detailQueuedOffline];
        case 'TIMEOUT':
          return [t.detailQueuedTimeout];
        case 'SERVER_UNAVAILABLE':
          return [t.detailQueuedServerUnavailable];
        default:
          return [t.detailQueuedWaiting];
      }
    case 'SENDING':
      return [t.detailPending];
    case 'ACCEPTED':
      return [t.detailAccepted(formatTime(entry.acceptedAt ?? '')), t.detailAcceptedNotAcknowledged];
    case 'FAILED':
      return [
        entry.problem === 'PERMISSION_DENIED' ? t.detailFailedPermission : t.detailFailedRejected,
        t.detailFailedFallback,
      ];
  }
}

interface Props {
  entry: CheckInEntry;
  onRetry: (key: string) => void;
  headingLevel?: 'h2' | 'h3';
  heading?: string;
}

export const SubmissionCard = forwardRef<HTMLElement, Props>(function SubmissionCard(
  { entry, onRetry, headingLevel: Heading = 'h3', heading },
  ref,
) {
  const { t, formatTime } = useI18n();
  const state = toDeliveryState(entry);
  return (
    <article ref={ref} tabIndex={-1} className={`sc-card sc-state--${state}`} data-state={state} data-testid="submission">
      {heading && <Heading className="sc-card-heading">{heading}</Heading>}
      <p className="sc-card-status">
        {entry.payload.status === 'SAFE' ? t.statusSafe : t.statusNeedHelp}
      </p>
      <p className="sc-state-label">
        <span aria-hidden="true">{STATE_ICON[state]}</span> {STATE_LABEL[state](t)}
      </p>
      {describeEntry(entry, t, formatTime).map((line) => (
        <p key={line} className="sc-card-detail">
          {line}
        </p>
      ))}
      {entry.payload.note && <p className="sc-card-note">“{entry.payload.note}”</p>}
      <p className="sc-small">
        {t.createdOnPhoneAt(formatTime(entry.createdAt))}
        {entry.attempts > 0 && ` · ${t.attempts(entry.attempts)}`}
      </p>
      {entry.lifecycle === 'FAILED' && (
        <button type="button" className="sc-button sc-button--secondary" onClick={() => onRetry(entry.key)}>
          {t.retry}
        </button>
      )}
    </article>
  );
});
