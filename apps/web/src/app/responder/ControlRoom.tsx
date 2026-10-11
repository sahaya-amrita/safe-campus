import { useEffect, useMemo, useState } from 'react';
import type {
  HelpAction,
  HelpRequest,
  Incident,
  Me,
  ReviewDecision,
  SahayaApi,
} from '../api/sahaya';
import { useTourTarget } from '../../components/tom';
import { hasRole } from '../auth/session';
import { IncidentForm } from '../IncidentForm';
import { useRoute } from '../router';
import { useStaffLink } from '../staff/workspace';
import {
  Card,
  EmptyState,
  ErrorNotice,
  HelpStatusPill,
  Loading,
  Pill,
  VerificationPill,
  formatWhen,
  useAsync,
} from '../ui';
import {
  ACK_TARGET_SECONDS,
  ESCALATE_AFTER_SECONDS,
  LEVEL_TEXT,
  ackState,
  formatDuration,
  sortHazardQueue,
  sortHelpQueue,
} from './controlRoomModel';
import { StopAllDrills, useActiveDrills } from './drillControl';
import { Stat, useActions } from './shared';

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const prettyType = (type: string) => type.toLowerCase().replace(/_/g, ' ');

/**
 * One-screen control room (blueprint Appendix C): help requests with
 * acknowledgement timers, check-in counts, and the hazard queue by level.
 * Every decision is made by a person; the screen only orders and times work.
 */
export function ControlRoom({ api, user }: { api: SahayaApi; user: Me }) {
  const now = useNow();
  const statsTarget = useTourTarget('control.stats');
  const helpTarget = useTourTarget('control.help');
  const hazardTarget = useTourTarget('control.hazards');
  const { navigate } = useRoute();
  const link = useStaffLink();
  const incidents = useAsync(() => api.listIncidents(100), [api], 10_000);
  const help = useAsync(() => api.listHelpRequests(), [api], 10_000);
  const drills = useActiveDrills(api);

  const helpQueue = useMemo(() => sortHelpQueue(help.data?.items ?? [], now), [help.data, now]);
  const hazards = useMemo(() => sortHazardQueue(incidents.data?.items ?? []), [incidents.data]);
  const waiting = helpQueue.filter((h) => !h.acknowledgedAt);
  const overdue = waiting.filter((h) => {
    const state = ackState(h, now);
    return state.kind === 'WAITING' && state.stage !== 'ON_TIME';
  });
  const suspected = hazards.filter((h) => h.level === 2).length;
  const verified = hazards.filter((h) => h.level === 3).length;

  return (
    <div className="as-stack">
      {drills.active.length > 0 && (
        <div className="as-drillbar" role="status">
          <span>
            <strong>DRILL running:</strong> {drills.active.map((d) => d.name).join(', ')}
          </span>
          <StopAllDrills api={api} onStopped={() => drills.reload()} />
        </div>
      )}

      <div className="as-grid2 as-control__stats" ref={statsTarget}>
        <Stat
          value={waiting.length}
          label="Waiting for acknowledgement"
          onClick={() => navigate(link('help'))}
        />
        <Stat
          value={overdue.length}
          label={`Over ${ACK_TARGET_SECONDS / 60} min without acknowledgement`}
        />
        <Stat
          value={suspected}
          label="L2 suspected hazards"
          onClick={() => navigate(link('incidents'))}
        />
        <Stat
          value={verified}
          label="L3 verified, open"
          onClick={() => navigate(link('incidents'))}
        />
      </div>
      {Boolean(help.error) && <ErrorNotice error={help.error} onRetry={help.reload} />}
      {Boolean(incidents.error) && (
        <ErrorNotice error={incidents.error} onRetry={incidents.reload} />
      )}

      <div className="as-control">
        <div ref={helpTarget}>
          <Card title="Help requests" icon="hand" labelledBy="as-cr-help">
            <p className="as-muted as-small">
              Oldest unacknowledged first. Timers: acknowledge within {ACK_TARGET_SECONDS / 60} min,
              escalate by phone after {ESCALATE_AFTER_SECONDS / 60} min (DEMO values; the ERT sets
              the real ones).
            </p>
            {help.loading && !help.data && <Loading />}
            {help.data && helpQueue.length === 0 && (
              <EmptyState icon="check" title="No active help requests." />
            )}
            <ul className="as-list">
              {helpQueue.map((h) => (
                <HelpItem key={h.id} api={api} user={user} h={h} now={now} onDone={help.reload} />
              ))}
            </ul>
          </Card>
        </div>

        <CheckinCounts api={api} incidents={incidents.data?.items ?? []} />

        <div ref={hazardTarget}>
          <Card title="Hazard queue" icon="alert" labelledBy="as-cr-hazards">
            <p className="as-muted as-small">
              Levels come from report facts. Several reports mean “look now”, not “it is true”. Only
              a person can verify (L3).
            </p>
            {incidents.loading && !incidents.data && <Loading />}
            {incidents.data && hazards.length === 0 && (
              <EmptyState icon="check" title="No open hazard reports." />
            )}
            <ul className="as-list">
              {hazards.map((i) => (
                <HazardItem
                  key={i.id}
                  api={api}
                  user={user}
                  incident={i}
                  onDone={incidents.reload}
                  onOpen={() => navigate(link('incidents', i.id))}
                />
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <details className="as-card as-details">
        <summary>Start a simulated incident</summary>
        <p className="as-muted">
          For drills when nobody can report: staff open an incident directly. Students can then be
          alerted and check in without having reported anything themselves.
        </p>
        <IncidentForm
          api={api}
          online={navigator.onLine}
          variant="simulated"
          onDone={() => incidents.reload()}
        />
      </details>
    </div>
  );
}

function HelpItem({
  api,
  user,
  h,
  now,
  onDone,
}: {
  api: SahayaApi;
  user: Me;
  h: HelpRequest;
  now: number;
  onDone: () => void;
}) {
  const { run, busy, errors } = useActions();
  const state = ackState(h, now);
  const isResponder = hasRole(user, 'RESPONDER');
  const canAck = h.status === 'OPEN' && hasRole(user, 'RESPONDER', 'ADMIN');
  const canAssign = (h.status === 'OPEN' || h.status === 'ACKNOWLEDGED') && isResponder;
  const actions: { action: HelpAction; label: string }[] = [
    ...(canAck ? [{ action: 'acknowledge' as const, label: 'Acknowledge' }] : []),
    ...(canAssign ? [{ action: 'assign' as const, label: 'Assign to me' }] : []),
  ];
  const tone =
    state.kind === 'WAITING'
      ? state.stage === 'ON_TIME'
        ? 'info'
        : state.stage === 'OVERDUE'
          ? 'warn'
          : 'danger'
      : state.kind === 'ACKNOWLEDGED' && state.late
        ? 'warn'
        : 'ok';
  return (
    <li className={`as-item as-timer-item as-timer-item--${tone}`}>
      <div className="as-row as-row--between">
        <HelpStatusPill status={h.status} />
        {state.kind === 'WAITING' && (
          <Pill tone={tone}>Waiting {formatDuration(state.seconds)}</Pill>
        )}
        {state.kind === 'ACKNOWLEDGED' && (
          <Pill tone={tone}>Acknowledged after {formatDuration(state.seconds)}</Pill>
        )}
      </div>
      {h.details && <p className="as-clamp">{h.details}</p>}
      <p className="as-muted as-small">
        {h.incidentId ? 'Incident' : 'Drill'} · {h.zoneId ? 'zone recorded' : 'no zone'} · opened{' '}
        {formatWhen(h.createdAt)}
      </p>
      {state.kind === 'WAITING' && state.stage === 'ESCALATE' && (
        <p className="as-notice as-notice--danger as-small" role="alert">
          No acknowledgement for {formatDuration(state.seconds)}. Escalate to the Security Officer
          control post by phone (ERT procedure). The app does not escalate on its own.
        </p>
      )}
      {actions.length > 0 && (
        <div className="as-row">
          {actions.map(({ action, label }) => (
            <button
              key={action}
              type="button"
              className="as-btn as-btn--sm"
              disabled={busy !== null}
              onClick={() =>
                void run(
                  `${h.id}:${action}`,
                  (key) => api.transitionHelpRequest(h.id, action, key),
                  onDone,
                )
              }
            >
              {busy === `${h.id}:${action}` ? 'Saving…' : label}
            </button>
          ))}
        </div>
      )}
      {actions.map(({ action }) =>
        errors[`${h.id}:${action}`] ? (
          <ErrorNotice key={action} error={errors[`${h.id}:${action}`]} />
        ) : null,
      )}
    </li>
  );
}

type HazardAction = { decision: ReviewDecision; label: string; reason: string; tone?: string };

function HazardItem({
  api,
  user,
  incident: i,
  onDone,
  onOpen,
}: {
  api: SahayaApi;
  user: Me;
  incident: Incident;
  onDone: () => void;
  onOpen: () => void;
}) {
  const { run, busy, errors } = useActions();
  const [pending, setPending] = useState<HazardAction | null>(null);
  const [reason, setReason] = useState('');
  const canReview = hasRole(user, 'INCIDENT_VERIFIER', 'ADMIN');
  const level = i.level ? LEVEL_TEXT[i.level] : null;
  const related = i.relatedIncidentIds ?? [];
  const actions: HazardAction[] =
    i.verificationStatus === 'VERIFIED'
      ? [{ decision: 'RESOLVED', label: 'Resolve', reason: 'Resolved on scene by responders.' }]
      : [
          {
            decision: 'VERIFIED',
            label: 'Confirm',
            reason: 'Confirmed by an authorised responder.',
          },
          {
            decision: 'DISMISSED',
            label: 'Refute',
            reason: 'Checked by a responder: not confirmed.',
          },
          ...(related.length
            ? [
                {
                  decision: 'DISMISSED' as const,
                  label: 'Duplicate',
                  reason: `Duplicate of incident ${related[0]!.slice(0, 8)}.`,
                },
              ]
            : []),
        ];
  const key = (a: HazardAction) => `${i.id}:${a.label}`;
  return (
    <li className={`as-item as-hazard as-hazard--l${i.level ?? 0}`}>
      <div className="as-row as-row--between">
        <span className="as-item__title">{prettyType(i.type)}</span>
        {level && <span className={`as-level as-level--${i.level}`}>{level.short}</span>}
      </div>
      {level && <p className="as-small">{level.text}</p>}
      <p className="as-muted as-small">
        {i.reportCount ?? 1} report{(i.reportCount ?? 1) === 1 ? '' : 's'} ·{' '}
        {i.independentReporters ?? 1} {(i.independentReporters ?? 1) === 1 ? 'person' : 'people'} ·{' '}
        {i.priority} · {formatWhen(i.createdAt)}
        {related.length > 0 &&
          ` · ${related.length} similar open report${related.length === 1 ? '' : 's'}`}
      </p>
      <div className="as-row">
        <VerificationPill status={i.verificationStatus} />
        <button type="button" className="as-btn as-btn--ghost as-btn--sm" onClick={onOpen}>
          Open
        </button>
        {canReview &&
          actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={`as-btn as-btn--sm${a.decision === 'DISMISSED' ? ' as-btn--ghost' : a.decision === 'RESOLVED' ? ' as-btn--ok' : ''}`}
              aria-pressed={pending?.label === a.label}
              onClick={() => {
                setPending(a);
                setReason(a.reason);
              }}
            >
              {a.label}
            </button>
          ))}
      </div>
      {pending && (
        <form
          className="as-form as-inline-review"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              key(pending),
              (k) =>
                api.reviewIncident(i.id, { status: pending.decision, reason: reason.trim() }, k),
              () => {
                setPending(null);
                onDone();
              },
            );
          }}
        >
          <label className="as-field">
            Reason for “{pending.label}” (audit log)
            <input
              className="as-input"
              required
              minLength={5}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {pending.decision === 'VERIFIED' && (
            <p className="as-small as-muted">Verifying an incident suspends any running drill.</p>
          )}
          <div className="as-row">
            <button
              type="submit"
              className="as-btn as-btn--sm"
              disabled={busy !== null || reason.trim().length < 5}
            >
              {busy === key(pending) ? 'Saving…' : `Record: ${pending.label}`}
            </button>
            <button
              type="button"
              className="as-btn as-btn--ghost as-btn--sm"
              onClick={() => setPending(null)}
            >
              Cancel
            </button>
          </div>
          {Boolean(errors[key(pending)]) && <ErrorNotice error={errors[key(pending)]} />}
        </form>
      )}
    </li>
  );
}

/** Safe / Help / Unconfirmed for one open incident (server counts; never "missing"). */
function CheckinCounts({ api, incidents }: { api: SahayaApi; incidents: readonly Incident[] }) {
  const open = incidents.filter((i) => i.level !== null && i.level !== undefined);
  const [chosen, setChosen] = useState<string | null>(null);
  const id = chosen && open.some((i) => i.id === chosen) ? chosen : (open[0]?.id ?? null);
  const summary = useAsync(id ? () => api.checkinSummary(id) : null, [api, id], 10_000);
  return (
    <Card title="Check-ins" icon="check" labelledBy="as-cr-checkins">
      {open.length === 0 ? (
        <EmptyState title="No open incident to count check-ins for." />
      ) : (
        <>
          <label className="as-field">
            Incident
            <select
              className="as-select"
              value={id ?? ''}
              onChange={(e) => setChosen(e.target.value)}
            >
              {open.map((i) => (
                <option key={i.id} value={i.id}>
                  {prettyType(i.type)} · {formatWhen(i.createdAt)}
                </option>
              ))}
            </select>
          </label>
          {summary.loading && !summary.data && <Loading />}
          {Boolean(summary.error) && <ErrorNotice error={summary.error} onRetry={summary.reload} />}
          {summary.data && (
            <div className="as-counts">
              <div className="as-count as-count--ok">
                <strong>{summary.data.counts.CONFIRMED_SAFE}</strong>
                <span>Safe</span>
              </div>
              <div className="as-count as-count--danger">
                <strong>{summary.data.counts.HELP_REQUESTED}</strong>
                <span>Need help</span>
              </div>
              <div className="as-count">
                <strong>{summary.data.counts.UNCONFIRMED}</strong>
                <span>Unconfirmed</span>
              </div>
            </div>
          )}
          <p className="as-muted as-small">
            Unconfirmed never means missing or injured. Follow up by phone, warden check or physical
            roll call.
          </p>
        </>
      )}
    </Card>
  );
}
