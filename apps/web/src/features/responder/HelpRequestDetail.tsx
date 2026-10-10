import { useEffect, useRef, useState } from 'react';
import type { ResponderApi } from './api';
import { newIdempotencyKey } from './api';
import { describeError } from './apiError';
import type { HelpRequest } from './contracts';
import { formatTimestamp } from './formatTime';
import { canAcknowledge, HELP_REQUEST_STATUS_PRESENTATION } from './helpRequests';
import { Icon } from './Icon';
import { StatusBadge } from './StatusBadge';

export interface HelpRequestDetailProps {
  request: HelpRequest;
  api: Pick<ResponderApi, 'acknowledgeHelpRequest'>;
  onUpdated: (request: HelpRequest) => void;
  onClose: () => void;
  now?: () => Date;
}

type AckState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'confirmed'; at: string }
  | { phase: 'failed'; message: string };

export function HelpRequestDetail({
  request,
  api,
  onUpdated,
  onClose,
  now = () => new Date(),
}: HelpRequestDetailProps) {
  const [ack, setAck] = useState<AckState>({ phase: 'idle' });
  // Re-used across retries so a retried request cannot create a second acknowledgement.
  const idempotencyKey = useRef<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const p = HELP_REQUEST_STATUS_PRESENTATION[request.status];

  useEffect(() => {
    setAck({ phase: 'idle' });
    idempotencyKey.current = null;
    headingRef.current?.focus();
  }, [request.id]);

  async function acknowledge() {
    if (ack.phase === 'submitting' || !canAcknowledge(request)) return;
    idempotencyKey.current ??= newIdempotencyKey();
    setAck({ phase: 'submitting' });
    try {
      // No optimistic update: the displayed status changes only from the server's response.
      const updated = await api.acknowledgeHelpRequest(request.id, idempotencyKey.current);
      idempotencyKey.current = null;
      setAck({ phase: 'confirmed', at: updated.acknowledgedAt ?? updated.lastUpdatedAt });
      onUpdated(updated);
    } catch (error) {
      setAck({ phase: 'failed', message: describeError(error) });
    }
  }

  const n = now();
  return (
    <section
      className={`sc-view sc-detail sc-detail--${p.tone}`}
      aria-labelledby="sc-hr-detail-title"
    >
      <button type="button" className="sc-btn sc-btn--ghost sc-detail__back" onClick={onClose}>
        <Icon name="back" size={16} /> Back to queue
      </button>
      <div className="sc-detail__card">
        <div className="sc-detail__header">
          <h2 id="sc-hr-detail-title" tabIndex={-1} ref={headingRef}>
            Help request <span className="sc-mono">{request.id}</span>
          </h2>
          <StatusBadge {...p} />
        </div>
        <p className="sc-muted">{p.description}</p>
        <dl className="sc-fields">
          <dt>Received</dt>
          <dd>{formatTimestamp(request.createdAt, n)}</dd>
          <dt>Last updated</dt>
          <dd>{formatTimestamp(request.lastUpdatedAt, n)}</dd>
          <dt>Priority</dt>
          <dd>{request.priority ?? 'Not set by server'}</dd>
          <dt>Location reference</dt>
          <dd>{request.locationReference ?? 'Not provided'}</dd>
          <dt>Acknowledged</dt>
          <dd>
            {request.acknowledgedAt
              ? `${formatTimestamp(request.acknowledgedAt, n)}${request.acknowledgedBy ? ` by ${request.acknowledgedBy}` : ''}`
              : 'Not acknowledged'}
          </dd>
          <dt>Assigned responder</dt>
          <dd>{request.assignedResponderId ?? 'None assigned'}</dd>
        </dl>
      </div>
      {canAcknowledge(request) ? (
        <div className="sc-action">
          <p className="sc-muted" id="sc-ack-help">
            Acknowledging records on the server that you have seen this request. In this prototype
            it does not notify the student or dispatch anyone.
          </p>
          <button
            type="button"
            className="sc-btn sc-btn--primary"
            onClick={acknowledge}
            disabled={ack.phase === 'submitting'}
            aria-describedby="sc-ack-help"
          >
            {ack.phase === 'failed' ? 'Retry acknowledgement' : 'Acknowledge request'}
          </button>
        </div>
      ) : (
        <p className="sc-muted sc-action">
          No further actions are available here: only acknowledgement has an agreed API operation so
          far.
        </p>
      )}

      <div role="status" aria-live="polite" className="sc-live">
        {ack.phase === 'submitting' &&
          'Acknowledging… waiting for server confirmation. Not yet acknowledged.'}
        {ack.phase === 'confirmed' &&
          `Acknowledgement recorded by the server at ${formatTimestamp(ack.at, n)}.`}
      </div>
      {ack.phase === 'failed' && (
        <p role="alert" className="sc-notice sc-notice--error">
          Not acknowledged. {ack.message} The request's status has not changed.
        </p>
      )}
    </section>
  );
}
