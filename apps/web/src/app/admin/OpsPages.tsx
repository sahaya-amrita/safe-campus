import { useState } from 'react';
import type { SystemSettings } from '@sahaya/contracts';
import type { SahayaApi } from '../api/sahaya';
import { describeAuthError } from '../auth/AuthScreens';
import {
  Button,
  ErrorState,
  FormError,
  Skeleton,
  StatusBanner,
  Surface,
  TextField,
} from '../../design-system';
import { formatWhen, useAsync } from '../ui';

const FIELDS: { key: keyof SystemSettings; label: string; hint: string; unit: string }[] = [
  {
    key: 'ackTargetSeconds',
    label: 'Acknowledge help requests within',
    hint: 'The control-room target (T1). Requests past it are shown as overdue.',
    unit: 'seconds',
  },
  {
    key: 'escalateAfterSeconds',
    label: 'Prompt to escalate by phone after',
    hint: 'T2. Must be later than T1. The app never escalates on its own.',
    unit: 'seconds',
  },
  {
    key: 'maxMatchedResponders',
    label: 'Responders matched per help request',
    hint: 'Verified, on-duty responders who get an in-app notice.',
    unit: 'responders',
  },
  {
    key: 'unattachedPhotoHours',
    label: 'Delete unattached photo uploads after',
    hint: 'Photos uploaded but never attached to a report.',
    unit: 'hours',
  },
];

/** System settings (ADMIN). Changes need a source and a reason, and are audited. */
export function SettingsPage({ api }: { api: SahayaApi }) {
  const settings = useAsync(() => api.settings(), [api]);
  const [draft, setDraft] = useState<Partial<Record<keyof SystemSettings, string>>>({});
  const [source, setSource] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (settings.loading && !settings.data) return <Skeleton lines={4} label="settings" />;
  if (!settings.data)
    return (
      <ErrorState
        title="Could not load settings"
        message={describeAuthError(settings.error)}
        onRetry={settings.reload}
      />
    );
  const current = settings.data;

  const save = async () => {
    const values: Partial<SystemSettings> = {};
    for (const field of FIELDS) {
      const raw = draft[field.key];
      if (raw === undefined || raw === String(current.values[field.key])) continue;
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) {
        setError(`${field.label}: enter a whole number.`);
        return;
      }
      values[field.key] = n;
    }
    if (Object.keys(values).length === 0) {
      setError('Nothing has changed.');
      return;
    }
    if (source.trim().length < 3 || reason.trim().length < 5) {
      setError('Say where the values come from (source) and why you are changing them (reason).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.updateSettings({ values, source: source.trim(), reason: reason.trim() });
      setDraft({});
      setSource('');
      setReason('');
      setDone('Saved and recorded in the audit log.');
      settings.reload();
    } catch (reason) {
      setError(describeAuthError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="as-stack">
      <StatusBanner tone="info" title="Use agreed values">
        Timers should come from the emergency response team. Until an administrator sets them, the
        app uses DEMO defaults and says so.
      </StatusBanner>
      {done && <StatusBanner tone="ok">{done}</StatusBanner>}
      <Surface title="Settings">
        <div className="as-stack">
          {FIELDS.map((f) => {
            const meta = current.meta[f.key];
            return (
              <div key={f.key}>
                <TextField
                  label={`${f.label} (${f.unit})`}
                  hint={`${f.hint} ${meta ? `Set from: ${meta.source}, ${formatWhen(meta.updatedAt)}.` : 'DEMO default.'}`}
                  inputMode="numeric"
                  value={draft[f.key] ?? String(current.values[f.key])}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                />
              </div>
            );
          })}
          <TextField
            label="Source of these values"
            hint="For example: ERT memo of 12 October."
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          <TextField
            label="Reason (kept in the audit log)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <FormError>{error}</FormError>
          <Button loading={busy} onClick={() => void save()}>
            Save settings
          </Button>
        </div>
      </Surface>
    </div>
  );
}

function Bars({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (entries.length === 0) return <p className="as-small as-muted">None in this period.</p>;
  return (
    <ul className="as-bars">
      {entries.map(([label, value]) => (
        <li key={label}>
          <span className="as-bars__label">{label.replace(/_/g, ' ').toLowerCase()}</span>
          <span className="as-bars__track" aria-hidden="true">
            <span className="as-bars__fill" style={{ width: `${(value / max) * 100}%` }} />
          </span>
          <span className="as-bars__value">{value}</span>
        </li>
      ))}
    </ul>
  );
}

const seconds = (s: number | null) =>
  s === null ? '—' : s < 120 ? `${s} s` : `${Math.round(s / 6) / 10} min`;

/** Descriptive analytics (ADMIN). Counts only; no predictions or rankings of people. */
export function AnalyticsPage({ api }: { api: SahayaApi }) {
  const [days, setDays] = useState(30);
  const analytics = useAsync(() => api.analytics(days), [api, days]);
  const a = analytics.data;
  return (
    <div className="as-stack">
      <div className="as-seg" role="group" aria-label="Period">
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>
            Last {d} days
          </button>
        ))}
      </div>
      {analytics.loading && !a ? (
        <Skeleton lines={5} label="analytics" />
      ) : !a ? (
        <ErrorState
          title="Could not load analytics"
          message={describeAuthError(analytics.error)}
          onRetry={analytics.reload}
        />
      ) : (
        <>
          <StatusBanner tone="warn">{a.dataNote}</StatusBanner>
          <Surface title={`Reports (${a.reports.total})`}>
            <h3 className="as-small">By category</h3>
            <Bars data={a.reports.byCategory} />
            <h3 className="as-small">By kind</h3>
            <Bars data={a.reports.byKind} />
            <h3 className="as-small">By verification</h3>
            <Bars data={a.reports.byVerification} />
          </Surface>
          <Surface title={`Help requests (${a.helpRequests.total})`}>
            <div className="as-grid2 as-progress">
              <p>
                <strong>{seconds(a.helpRequests.medianAckSeconds)}</strong>
                <span className="as-muted as-small">median time to acknowledge</span>
              </p>
              <p>
                <strong>{seconds(a.helpRequests.p90AckSeconds)}</strong>
                <span className="as-muted as-small">90th percentile</span>
              </p>
              <p>
                <strong>{a.helpRequests.overAckTarget}</strong>
                <span className="as-muted as-small">
                  over the {seconds(a.helpRequests.ackTargetSeconds)} target
                </span>
              </p>
            </div>
            <h3 className="as-small">By status</h3>
            <Bars data={a.helpRequests.byStatus} />
            <h3 className="as-small">By source</h3>
            <Bars data={a.helpRequests.bySource} />
          </Surface>
          <Surface title="Drills">
            {a.drills.length === 0 ? (
              <p className="as-small as-muted">No drills in this period.</p>
            ) : (
              <div className="as-table-wrap">
                <table className="as-table">
                  <thead>
                    <tr>
                      <th scope="col">Drill</th>
                      <th scope="col">Checked in</th>
                      <th scope="col">Safe</th>
                      <th scope="col">Asked for help</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.drills.map((d) => (
                      <tr key={d.name}>
                        <td data-label="Drill">{d.name}</td>
                        <td data-label="Checked in">{d.participants}</td>
                        <td data-label="Safe">{d.safe}</td>
                        <td data-label="Asked for help">{d.needHelp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Surface>
          <Surface title="Photos">
            <p>
              {a.photos.uploaded} uploaded, {a.photos.attached} attached to reports.
            </p>
          </Surface>
        </>
      )}
    </div>
  );
}
