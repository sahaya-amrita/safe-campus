import { useEffect, useMemo, useState } from 'react';
import type { ResponderView, RollCallStatus } from '@sahaya/contracts';
import {
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusBanner,
  Surface,
} from '../../design-system';
import { ApiError, describeProblem } from '../api/client';
import type { SahayaApi } from '../api/sahaya';
import { Pill, formatWhen, useAsync, type Tone } from '../ui';
import { browserPushEnvironment, type PushEnvironment } from '../../lib/push';

const DUTY: { value: ResponderView['availability']; label: string }[] = [
  { value: 'AVAILABLE', label: 'On duty' },
  { value: 'BUSY', label: 'Busy' },
  { value: 'OFF_DUTY', label: 'Off duty' },
];

/**
 * The signed-in responder's duty status. Only a verified responder who is
 * "On duty" is matched to new help requests; the control says so.
 */
export function DutyControl({ api }: { api: SahayaApi }) {
  const profile = useAsync(() => api.myResponderProfile(), [api]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (profile.loading && !profile.data) return null;
  if (profile.error && !profile.data) {
    const missing =
      profile.error instanceof ApiError && profile.error.code === 'NO_RESPONDER_PROFILE';
    return (
      <Pill
        tone="neutral"
        title={missing ? 'An administrator must add you to the responder roster.' : undefined}
      >
        {missing ? 'Not on the responder roster' : 'Duty status unavailable'}
      </Pill>
    );
  }
  const me = profile.data!;
  const change = async (availability: ResponderView['availability']) => {
    setSaving(true);
    setError(null);
    try {
      await api.setDuty(availability);
      profile.reload();
    } catch (reason) {
      setError(describeProblem(reason));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="as-duty" role="group" aria-label="Your duty status">
      {!me.verified && (
        <Pill tone="warn" title="Unverified responders are never matched to help requests.">
          Not verified · not matched
        </Pill>
      )}
      <div className="as-seg as-duty__seg">
        {DUTY.map((d) => (
          <button
            key={d.value}
            type="button"
            aria-pressed={me.availability === d.value}
            disabled={saving}
            onClick={() => void change(d.value)}
          >
            {d.label}
          </button>
        ))}
      </div>
      {error && (
        <span className="as-small" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * Phone notices (Phase 8): optional Web Push for matched help requests. Off
 * unless the server has push keys. A notice only says a request was matched;
 * the in-app inbox stays the record, so on-duty responders still check it.
 */
export function PhoneNotices({ api, env: injected }: { api: SahayaApi; env?: PushEnvironment }) {
  const env = useMemo(() => injected ?? browserPushEnvironment(), [injected]);
  const config = useAsync(() => api.pushConfig(), [api]);
  const [onDevice, setOnDevice] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!env.supported) return;
    let live = true;
    env
      .current()
      .then((sub) => live && setOnDevice(Boolean(sub)))
      .catch(() => live && setOnDevice(false));
    return () => {
      live = false;
    };
  }, [env]);

  const view = config.data;
  if (!view) return null;
  if (!view.enabled)
    return (
      <p className="as-small as-muted" role="note">
        {view.note}
      </p>
    );

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = env.permission() === 'granted' ? 'granted' : await env.requestPermission();
      if (permission !== 'granted') {
        setError('Notifications are blocked for this site. Allow them in the browser settings.');
        return;
      }
      const sub = await env.subscribe(view.publicKey!);
      await api.registerPushDevice(sub);
      setOnDevice(true);
      config.reload();
    } catch (reason) {
      setError(describeProblem(reason));
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    setError(null);
    try {
      const endpoint = await env.unsubscribe();
      if (endpoint) await api.removePushDevice(endpoint);
      setOnDevice(false);
      config.reload();
    } catch (reason) {
      setError(describeProblem(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Surface title="Phone notices" description={view.note}>
      {!env.supported ? (
        <p className="as-small as-muted">
          This browser cannot show notices. On iPhone, add Amrita Sahaya to the Home Screen first.
        </p>
      ) : (
        <div className="as-row">
          <Pill tone={onDevice ? 'ok' : 'neutral'}>
            {onDevice ? 'On for this device' : 'Off for this device'}
          </Pill>
          {onDevice ? (
            <Button variant="secondary" loading={busy} onClick={() => void turnOff()}>
              Turn off on this device
            </Button>
          ) : (
            <Button loading={busy} onClick={() => void turnOn()}>
              Turn on for this device
            </Button>
          )}
        </div>
      )}
      {error && (
        <p className="as-small" role="alert">
          {error}
        </p>
      )}
    </Surface>
  );
}

/** Help requests this responder was matched to: in-app notices only (DEMO). */
export function MatchedInbox({ api, onChange }: { api: SahayaApi; onChange?: () => void }) {
  const inbox = useAsync(() => api.responderInbox(), [api], 20_000);
  const [busy, setBusy] = useState(false);
  if (inbox.error instanceof ApiError && inbox.error.code === 'NO_RESPONDER_PROFILE') return null;
  if (!inbox.data) return null;
  const unseen = inbox.data.items.filter((i) => !i.seenAt);
  if (inbox.data.items.length === 0) return null;
  return (
    <Surface
      title={`Matched to you${inbox.data.unseen ? ` (${inbox.data.unseen} new)` : ''}`}
      description={inbox.data.note}
      action={
        unseen.length > 0 ? (
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.markInboxSeen(unseen.map((i) => i.helpRequestId));
                inbox.reload();
                onChange?.();
              } finally {
                setBusy(false);
              }
            }}
          >
            Mark all as seen
          </Button>
        ) : undefined
      }
    >
      <ul className="as-list">
        {inbox.data.items.slice(0, 5).map((item) => (
          <li key={item.helpRequestId} className="as-item">
            <div className="as-row as-row--between">
              <span>
                <strong>{item.source === 'SOS' ? 'SOS' : 'Help request'}</strong>
                {item.category ? ` · ${item.category.replace(/_/g, ' ').toLowerCase()}` : ''}
                {item.sameZone ? ' · your zone' : ''}
              </span>
              <Pill tone={item.seenAt ? 'neutral' : 'danger'}>{item.seenAt ? 'Seen' : 'New'}</Pill>
            </div>
            <p className="as-small as-muted">
              Matched {formatWhen(item.matchedAt)} · status {item.status.toLowerCase()}. Matching is
              not an assignment: acknowledge or assign it below.
            </p>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

const ROLL_TONE: Record<RollCallStatus, Tone> = {
  NEEDS_HELP: 'danger',
  NO_RESPONSE: 'warn',
  SAFE: 'ok',
};
const ROLL_LABEL: Record<RollCallStatus, string> = {
  NEEDS_HELP: 'Needs help',
  NO_RESPONSE: 'No response yet',
  SAFE: 'Said they are safe',
};

/** Per-person roll call for an incident or drill (staff only; every view is audited). */
export function RollCallCard({
  api,
  kind,
  id,
}: {
  api: SahayaApi;
  kind: 'incidents' | 'drills';
  id: string;
}) {
  const roll = useAsync(() => api.rollCall(kind, id), [api, kind, id], 30_000);
  return (
    <Surface
      title="Roll call"
      description="Who is in the affected area and what they last told the server."
      action={
        <Button size="sm" variant="ghost" icon="retry" onClick={roll.reload}>
          Refresh
        </Button>
      }
    >
      {roll.loading && !roll.data ? (
        <Skeleton lines={3} label="roll call" />
      ) : roll.error && !roll.data ? (
        roll.error instanceof ApiError && roll.error.problem === 'FORBIDDEN' ? (
          <StatusBanner tone="info">Roll call is limited to your assigned zone.</StatusBanner>
        ) : (
          <ErrorState
            title="Could not load the roll call"
            message={describeProblem(roll.error)}
            onRetry={roll.reload}
          />
        )
      ) : roll.data && roll.data.items.length === 0 ? (
        <EmptyState icon="users" title="Nobody is listed for this area">
          {roll.data.scope.zoneCount === 0
            ? 'This has no zone recorded, so only people who check in appear here.'
            : 'No students are registered in these zones yet.'}
        </EmptyState>
      ) : roll.data ? (
        <>
          <div className="as-row">
            <Pill tone="danger">{roll.data.counts.NEEDS_HELP} need help</Pill>
            <Pill tone="warn">{roll.data.counts.NO_RESPONSE} no response</Pill>
            <Pill tone="ok">{roll.data.counts.SAFE} safe</Pill>
          </div>
          <div className="as-table-wrap">
            <table className="as-table">
              <caption className="as-sr-only">Roll call, people needing help first</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last check-in</th>
                  <th scope="col">Help request</th>
                </tr>
              </thead>
              <tbody>
                {roll.data.items.map((p) => (
                  <tr key={p.studentId}>
                    <td>{p.displayName}</td>
                    <td>
                      <Pill tone={ROLL_TONE[p.status]}>{ROLL_LABEL[p.status]}</Pill>
                    </td>
                    <td>{p.lastCheckInAt ? formatWhen(p.lastCheckInAt) : '—'}</td>
                    <td>{p.helpRequestStatus ? p.helpRequestStatus.toLowerCase() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="as-small as-muted">{roll.data.note}</p>
        </>
      ) : null}
    </Surface>
  );
}
