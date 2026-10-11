import { useState } from 'react';
import type { ResponderView } from '@sahaya/contracts';
import type { Me, SahayaApi } from '../api/sahaya';
import { describeAuthError } from '../auth/AuthScreens';
import {
  Button,
  EmptyState,
  ErrorState,
  FormError,
  Pill,
  Sheet,
  Skeleton,
  StatusBanner,
  Surface,
  TextField,
} from '../../design-system';
import { formatWhen, useAsync } from '../ui';

type Change =
  | { kind: 'add' }
  | { kind: 'zone'; responder: ResponderView }
  | { kind: 'verify'; responder: ResponderView; verified: boolean };

const DUTY_LABEL: Record<ResponderView['availability'], string> = {
  AVAILABLE: 'On duty',
  BUSY: 'Busy',
  OFF_DUTY: 'Off duty',
};

/**
 * Responder roster (ADMIN). A profile starts unverified and off duty, so it
 * is never matched until an administrator verifies it and the responder goes
 * on duty. Every change needs a reason and is audited. DEMO: synthetic only.
 */
export function RosterPage({ api, user }: { api: SahayaApi; user: Me }) {
  const roster = useAsync(() => api.adminResponders(), [api]);
  const [change, setChange] = useState<Change | null>(null);
  const [done, setDone] = useState<string | null>(null);

  return (
    <div className="as-stack">
      <StatusBanner tone="info" title="Synthetic responders only">
        No institution-confirmed responder list exists yet. Matching uses assigned zones, not live
        location, and every notice is in-app only.
      </StatusBanner>
      {done && <StatusBanner tone="ok">{done}</StatusBanner>}
      <Surface
        title="Roster"
        description="Only verified responders who are on duty are matched to new help requests."
        action={
          <Button size="sm" icon="plus" onClick={() => setChange({ kind: 'add' })}>
            Add responder
          </Button>
        }
      >
        {roster.loading && !roster.data ? (
          <Skeleton lines={4} label="responders" />
        ) : roster.error && !roster.data ? (
          <ErrorState
            title="Could not load the roster"
            message={describeAuthError(roster.error)}
            onRetry={roster.reload}
          />
        ) : roster.data && roster.data.items.length === 0 ? (
          <EmptyState icon="users" title="Nobody is on the roster yet">
            Grant the RESPONDER role in Users and roles, then add the person here.
          </EmptyState>
        ) : (
          <ul className="as-user-list">
            {roster.data?.items.map((r) => (
              <li key={r.id} className="as-user">
                <div className="as-user__head">
                  <div>
                    <p className="as-user__name">
                      {r.displayName}
                      {r.userId === user.id && <span className="as-muted"> (you)</span>}
                    </p>
                    <p className="as-muted as-small">
                      {r.email} · {r.approvedRole}
                    </p>
                  </div>
                  <div className="as-row">
                    <Pill tone={r.verified ? 'ok' : 'warn'}>
                      {r.verified ? 'Verified' : 'Not verified'}
                    </Pill>
                    <Pill tone={r.availability === 'AVAILABLE' ? 'info' : 'neutral'}>
                      {DUTY_LABEL[r.availability]}
                    </Pill>
                  </div>
                </div>
                <p className="as-small as-muted">
                  Zone: {r.zoneName ?? 'none assigned'}
                  {r.dutyChangedAt ? ` · duty changed ${formatWhen(r.dutyChangedAt)}` : ''}
                  {r.verifiedAt ? ` · verified ${formatWhen(r.verifiedAt)}` : ''}
                </p>
                <div className="as-row">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setChange({ kind: 'zone', responder: r })}
                  >
                    Change zone
                  </Button>
                  {r.userId !== user.id && (
                    <Button
                      size="sm"
                      variant={r.verified ? 'ghost' : 'primary'}
                      onClick={() =>
                        setChange({ kind: 'verify', responder: r, verified: !r.verified })
                      }
                    >
                      {r.verified ? 'Remove verification' : 'Verify'}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Surface>
      {change && (
        <RosterSheet
          api={api}
          change={change}
          zones={roster.data?.zones ?? []}
          existing={roster.data?.items ?? []}
          onClose={() => setChange(null)}
          onDone={(message) => {
            setChange(null);
            setDone(message);
            roster.reload();
          }}
        />
      )}
    </div>
  );
}

function RosterSheet({
  api,
  change,
  zones,
  existing,
  onClose,
  onDone,
}: {
  api: SahayaApi;
  change: Change;
  zones: { id: string; name: string }[];
  existing: ResponderView[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const candidates = useAsync(
    change.kind === 'add' ? () => api.adminUsers({ role: 'RESPONDER', status: 'ACTIVE' }) : null,
    [api, change.kind],
  );
  const onRoster = new Set(existing.map((r) => r.userId));
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('');
  const [zoneId, setZoneId] = useState(
    change.kind === 'zone' ? (change.responder.zoneId ?? '') : '',
  );
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title =
    change.kind === 'add'
      ? 'Add a responder'
      : change.kind === 'zone'
        ? `Change zone: ${change.responder.displayName}`
        : `${change.verified ? 'Verify' : 'Remove verification'}: ${change.responder.displayName}`;

  const save = async () => {
    setError(null);
    if (reason.trim().length < 5) {
      setError('Give a reason of at least 5 characters. It is kept in the audit log.');
      return;
    }
    setBusy(true);
    try {
      if (change.kind === 'add') {
        if (!userId || role.trim().length < 2) {
          setError('Choose a person and describe their responder role.');
          setBusy(false);
          return;
        }
        await api.createResponder({
          userId,
          approvedRole: role.trim(),
          zoneId: zoneId || null,
          qualifications: [],
          reason: reason.trim(),
        });
        onDone('Added to the roster as unverified and off duty.');
      } else if (change.kind === 'zone') {
        await api.updateResponder(change.responder.id, {
          zoneId: zoneId || null,
          reason: reason.trim(),
        });
        onDone('Zone changed and recorded in the audit log.');
      } else {
        await api.verifyResponder(change.responder.id, change.verified, reason.trim());
        onDone(
          change.verified
            ? 'Verified. They are matched once they go on duty.'
            : 'Verification removed. They are off duty and no longer matched.',
        );
      }
    } catch (reason) {
      setError(describeAuthError(reason));
    } finally {
      setBusy(false);
    }
  };

  const zoneSelect = (
    <label className="ds-field">
      <span className="ds-field__label">Assigned zone</span>
      <select className="ds-input" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
        <option value="">No zone</option>
        {zones.map((z) => (
          <option key={z.id} value={z.id}>
            {z.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Sheet
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={change.kind === 'verify' && !change.verified ? 'danger' : 'primary'}
            loading={busy}
            loadingLabel="Saving…"
            onClick={() => void save()}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="as-stack">
        {change.kind === 'add' && (
          <>
            <label className="ds-field">
              <span className="ds-field__label">Person (has the RESPONDER role)</span>
              <select
                className="ds-input"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              >
                <option value="">Choose…</option>
                {candidates.data?.items
                  .filter((u) => !onRoster.has(u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} ({u.email})
                    </option>
                  ))}
              </select>
            </label>
            <TextField
              label="Responder role"
              hint="For example: first aider, security guard, warden."
              value={role}
              onChange={(e) => setRole(e.target.value)}
              maxLength={80}
            />
            {zoneSelect}
          </>
        )}
        {change.kind === 'zone' && zoneSelect}
        {change.kind === 'verify' && (
          <p>
            {change.verified
              ? 'Confirm you have checked this person can respond on campus. Verification is recorded with your name.'
              : 'They will be taken off duty and will no longer be matched to help requests.'}
          </p>
        )}
        <TextField
          label="Reason (kept in the audit log)"
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
        />
        <FormError>{error}</FormError>
      </div>
    </Sheet>
  );
}
