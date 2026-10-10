import { useRef, useState } from 'react';
import { newIdempotencyKey } from '../api/client';
import type { InboxAlert } from '../api/sahaya';
import {
  AppIcon,
  Card,
  EmptyState,
  ErrorNotice,
  Loading,
  Pill,
  VerificationPill,
  formatWhen,
} from '../ui';
import { useStudent } from './core';

function AlertCard({ alert, onAcknowledged }: { alert: InboxAlert; onAcknowledged: () => void }) {
  const s = useStudent();
  // One key per alert so a retry after a lost reply cannot double-record.
  const key = useRef(newIdempotencyKey());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const acknowledge = async () => {
    if (!s.api) return;
    setBusy(true);
    setError(null);
    try {
      await s.api.acknowledgeAlert(alert.id, key.current);
      onAcknowledged();
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="as-item">
      <div className="as-row as-row--between">
        <span className="as-item__title">{alert.title}</span>
        <Pill tone="neutral">{alert.mode} · simulated</Pill>
      </div>
      <p>{alert.message}</p>
      <div className="as-row">
        {alert.precautionary && <Pill tone="info">Precautionary</Pill>}
        {alert.incidentVerificationStatus ? (
          <VerificationPill status={alert.incidentVerificationStatus} />
        ) : (
          <Pill tone="neutral">Not linked to an incident</Pill>
        )}
      </div>
      <p className="as-muted as-small">
        Sent {formatWhen(alert.createdAt)} ·{' '}
        {alert.acknowledgedAt
          ? `You acknowledged ${formatWhen(alert.acknowledgedAt)}`
          : 'Not acknowledged yet'}
      </p>
      {Boolean(error) && <ErrorNotice error={error} />}
      {!alert.acknowledgedAt && (
        <button
          type="button"
          className="as-btn as-btn--sm"
          disabled={busy || !s.online}
          onClick={() => void acknowledge()}
        >
          <AppIcon name="check" size={16} />{' '}
          {busy ? 'Recording…' : s.online ? 'Acknowledge' : 'Offline — cannot acknowledge'}
        </button>
      )}
    </li>
  );
}

export function AlertsScreen() {
  const s = useStudent();
  if (!s.inbox || !s.incidents) {
    return <EmptyState icon="bell" title="Alerts need a signed-in API session." />;
  }
  const { inbox, incidents } = s;
  const items = inbox.data?.items ?? [];
  const active = items.filter((a) => !a.acknowledgedAt);
  const history = items.filter((a) => a.acknowledgedAt);
  const mine = incidents.data?.items ?? [];

  return (
    <>
      <div className="as-row as-row--between">
        <h1 className="as-screen-title">Alerts</h1>
        <button
          type="button"
          className="as-btn as-btn--ghost as-btn--sm"
          onClick={() => {
            inbox.reload();
            incidents.reload();
          }}
        >
          <AppIcon name="retry" size={16} /> Refresh
        </button>
      </div>
      {inbox.at && (
        <p className="as-muted as-small" role="status">
          Last updated {formatWhen(inbox.at.toISOString())}
          {!s.online && ' · Offline: showing the last copy; new alerts may exist.'}
        </p>
      )}
      <div className="as-notice" role="note">
        Alerts here are simulated and only reach this app. A <strong>reported</strong> incident is
        unverified; only an authorised reviewer can mark it <strong>verified</strong>.
      </div>

      <Card title="Active alerts" icon="bell" labelledBy="as-alerts-active">
        {inbox.loading && !inbox.data && <Loading />}
        {Boolean(inbox.error) && <ErrorNotice error={inbox.error} onRetry={inbox.reload} />}
        {inbox.data && active.length === 0 && (
          <EmptyState icon="check" title="No unacknowledged alerts sent to you.">
            <p>This does not mean campus is safe. Follow alarms, staff and official channels.</p>
          </EmptyState>
        )}
        {active.length > 0 && (
          <ul className="as-list">
            {active.map((a) => (
              <AlertCard key={a.id} alert={a} onAcknowledged={inbox.reload} />
            ))}
          </ul>
        )}
      </Card>

      <Card title="Incidents you reported" icon="report" labelledBy="as-alerts-mine">
        {incidents.loading && !incidents.data && <Loading />}
        {Boolean(incidents.error) && (
          <ErrorNotice error={incidents.error} onRetry={incidents.reload} />
        )}
        {incidents.data && mine.length === 0 && (
          <EmptyState title="You have not reported any incidents." />
        )}
        {mine.length > 0 && (
          <ul className="as-list">
            {mine.map((i) => (
              <li key={i.id} className="as-item">
                <div className="as-row as-row--between">
                  <span className="as-item__title">{i.type}</span>
                  <VerificationPill status={i.verificationStatus} />
                </div>
                <p className="as-muted">{i.description}</p>
                <p className="as-muted as-small">
                  Received by server {formatWhen(i.serverReceivedAt)} · priority {i.priority} ·{' '}
                  {i.mode}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Alert history" icon="clock" labelledBy="as-alerts-history">
        {history.length === 0 ? (
          <EmptyState title="No acknowledged alerts yet." />
        ) : (
          <ul className="as-list">
            {history.map((a) => (
              <AlertCard key={a.id} alert={a} onAcknowledged={inbox.reload} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
