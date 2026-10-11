import { forwardRef, type ReactNode } from 'react';
import { CriticalText } from '../../../i18n/CriticalText';
import type { PhotoUploadStatus } from '../attachments/photoUploads';
import { useI18n, type Messages } from '../../../i18n';
import { CLIENT_FAILURE } from '../api/studentApi';
import { toDeliveryStatus, type CheckInEntry } from '../checkIn/checkInQueue';
import type { MessageDeliveryStatus } from '../contracts/studentContract';
import { DeliveryTrack } from './DeliveryTrack';
import { Icon, type IconName } from './Icon';

export const STATE_ICON: Record<MessageDeliveryStatus, IconName> = {
  LOCAL_ONLY: 'pause',
  QUEUED: 'pause',
  SENDING: 'clock',
  SERVER_RECEIVED: 'check',
  ACKNOWLEDGED: 'check',
  FAILED: 'x',
};

/** Short label for a delivery status; "not sent" and "failed" carry the English source in draft locales. */
export function StateLabel({
  status,
  className,
}: {
  status: MessageDeliveryStatus;
  className?: string;
}) {
  const { t } = useI18n();
  const leading = <Icon name={STATE_ICON[status]} size={18} />;
  switch (status) {
    case 'LOCAL_ONLY':
      return <CriticalText k="stateLocalOnly" className={className} leading={leading} />;
    case 'QUEUED':
      return <CriticalText k="stateQueued" className={className} leading={leading} />;
    case 'FAILED':
      return <CriticalText k="stateFailed" className={className} leading={leading} />;
    default:
      return (
        <p className={className}>
          {leading}
          <span>
            {status === 'SENDING'
              ? t.stateSending
              : status === 'ACKNOWLEDGED'
                ? t.stateAcknowledged
                : t.stateReceived}
          </span>
        </p>
      );
  }
}

/** Exactly what is known about one check-in's delivery — never more. */
export function describeEntry(
  entry: CheckInEntry,
  t: Messages,
  formatTime: (iso: string) => string,
): ReactNode[] {
  switch (entry.lifecycle) {
    case 'QUEUED':
      return [
        entry.problem === 'OFFLINE'
          ? t.detailQueuedOffline
          : entry.problem === 'TIMEOUT'
            ? t.detailQueuedTimeout
            : entry.problem === 'SERVER_UNAVAILABLE'
              ? t.detailQueuedServerUnavailable
              : t.detailQueuedWaiting,
      ];
    case 'SENDING':
      return [t.detailPending];
    case 'ACCEPTED':
      return [
        t.detailReceived(formatTime(entry.result?.serverReceivedAt ?? entry.acceptedAt ?? '')),
        entry.result?.helpRequest ? (
          <CriticalText key="open" k="detailHelpOpen" as="span" className="sc-emph" />
        ) : (
          <CriticalText key="ack" k="detailAcceptedNotAcknowledged" as="span" className="sc-emph" />
        ),
      ];
    case 'FAILED':
      return [
        entry.problem === 'PERMISSION_DENIED'
          ? t.detailFailedPermission
          : entry.problemDetail === CLIENT_FAILURE.noSession
            ? t.detailFailedNoSession
            : entry.problemDetail === CLIENT_FAILURE.invalid
              ? t.detailFailedInvalid
              : t.detailFailedRejected,
        <CriticalText key="fallback" k="detailFailedFallback" as="span" className="sc-emph" />,
      ];
  }
}

interface Props {
  entry: CheckInEntry;
  onRetry: (key: string) => void;
  photoCount: number;
  /** Upload progress when photos can be sent (signed in); null keeps them on the device. */
  photoStatus?: PhotoUploadStatus | null;
  onDeletePhotos: (key: string) => void;
}

function photoLine(
  count: number,
  upload: PhotoUploadStatus | null,
  status: ReturnType<typeof toDeliveryStatus>,
  t: ReturnType<typeof useI18n>['t'],
): string {
  // Until the server has the request (or when uploads are unavailable), photos stay on the phone.
  if (!upload || status !== 'SERVER_RECEIVED' || upload.total === 0)
    return t.photosKeptOnPhone(count);
  if (upload.sent === upload.total) return t.photosSent(upload.total);
  if (upload.failed > 0) return t.photosNotSent(upload.total - upload.sent);
  return t.photosSending(upload.total - upload.sent);
}

/** The latest check-in: what was sent, its delivery status, and the delivery track. */
export const SubmissionCard = forwardRef<HTMLElement, Props>(function SubmissionCard(
  { entry, onRetry, photoCount, photoStatus = null, onDeletePhotos },
  ref,
) {
  const { t, formatTime } = useI18n();
  const status = toDeliveryStatus(entry);
  const isHelp = entry.payload.status === 'HELP_REQUESTED';
  return (
    <article
      ref={ref}
      tabIndex={-1}
      className={`sc-latest sc-latest--${status}`}
      data-state={status}
      data-testid="submission"
      aria-labelledby={`sc-latest-${entry.key}`}
    >
      <header className="sc-latest-head">
        <span className={`sc-kind ${isHelp ? 'sc-kind--help' : 'sc-kind--safe'}`}>
          <Icon name={isHelp ? 'hand' : 'check'} size={16} />
          <span id={`sc-latest-${entry.key}`}>{isHelp ? t.statusNeedHelp : t.statusSafe}</span>
        </span>
        <span className="sc-latest-time">{t.createdOnPhoneAt(formatTime(entry.createdAt))}</span>
      </header>

      <StateLabel status={status} className={`sc-state sc-state--${status}`} />
      <DeliveryTrack status={status} />

      <div className="sc-latest-detail">
        {describeEntry(entry, t, formatTime).map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
      {entry.payload.note && <blockquote className="sc-note">{entry.payload.note}</blockquote>}
      {(entry.payload.landmark || entry.payload.location) && (
        <p className="sc-meta-line">
          <Icon name="pin" size={14} />{' '}
          {[
            entry.payload.landmark,
            entry.payload.location && t.locationAccuracy(entry.payload.location.accuracyMetres),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {photoCount > 0 && (
        <div className="sc-photo-line">
          <p className="sc-meta-line">
            <Icon name="image" size={14} /> {photoLine(photoCount, photoStatus, status, t)}
          </p>
          <button
            type="button"
            className="sc-btn sc-btn--ghost sc-btn--small"
            onClick={() => onDeletePhotos(entry.key)}
          >
            <Icon name="trash" size={16} />
            {t.photosDelete}
          </button>
        </div>
      )}
      {entry.attempts > 0 && <p className="sc-meta-line">{t.attempts(entry.attempts)}</p>}
      {(entry.lifecycle === 'FAILED' || status === 'LOCAL_ONLY' || status === 'QUEUED') && (
        // Not delivered: offer the fallbacks together (blueprint Appendix C delivery chip).
        <div className="sc-fallbacks">
          {entry.lifecycle === 'FAILED' && (
            <button
              type="button"
              className="sc-btn sc-btn--ghost"
              onClick={() => onRetry(entry.key)}
            >
              <Icon name="retry" size={18} />
              {t.retry}
            </button>
          )}
          <a className="sc-btn sc-btn--ghost" href="tel:112">
            <Icon name="phone" size={18} />
            {t.emergencyCall}
          </a>
        </div>
      )}
    </article>
  );
});
