import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { verificationTransitions, type HelpRequestStatus } from '@sahaya/contracts';
import { ContactsView } from '../../features/responder/ContactsView';
import { CAMPUS_CONTACTS, OFFICIAL_RESOURCES } from '../../features/responder/campusDirectory';
import '../../features/responder/responder.css';
import type { HelpAction, HelpRequest, Me, ReviewDecision, SahayaApi } from '../api/sahaya';
import { hasRole } from '../auth/session';
import { useRoute } from '../router';
import { useStaffLink } from '../staff/workspace';
import { ControlRoom } from './ControlRoom';
import { IncidentSearch } from './IncidentSearch';
import { Stat, useActions } from './shared';
import { CampusMapPanel, type MapAlert } from '../twin/CampusMapPanel';
import { isActiveAlert } from '../twin/safeMapModel';
import {
  AppIcon,
  Card,
  EmptyState,
  ErrorNotice,
  HELP_STATUS,
  HelpStatusPill,
  Loading,
  Pill,
  VerificationPill,
  formatWhen,
  useAsync,
} from '../ui';

// ---------------------------------------------------------------------------
export function OverviewView({ api, user }: { api: SahayaApi; user: Me }) {
  return <ControlRoom api={api} user={user} />;
}

// ---------------------------------------------------------------------------
export function IncidentsView({ api }: { api: SahayaApi }) {
  return <IncidentSearch api={api} />;
}

// ---------------------------------------------------------------------------
function ReviewForm({
  api,
  id,
  current,
  onDone,
}: {
  api: SahayaApi;
  id: string;
  current: keyof typeof verificationTransitions;
  onDone: () => void;
}) {
  const options = verificationTransitions[current] as readonly ReviewDecision[];
  const [decision, setDecision] = useState<ReviewDecision | ''>('');
  const [reason, setReason] = useState('');
  const { run, busy, errors } = useActions();
  if (options.length === 0)
    return (
      <p className="as-muted">No further verification decisions are possible from {current}.</p>
    );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!decision) return;
    void run(
      `review-${decision}`,
      (key) => api.reviewIncident(id, { status: decision, reason: reason.trim() }, key),
      () => {
        setDecision('');
        setReason('');
        onDone();
      },
    );
  };
  return (
    <form className="as-form" onSubmit={submit}>
      <div className="as-seg" role="group" aria-label="Decision">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={decision === o}
            onClick={() => setDecision(o)}
          >
            {o.charAt(0) + o.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      <label className="as-field">
        Reason (recorded in the audit log)
        <textarea
          className="as-textarea"
          minLength={5}
          maxLength={1000}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {decision && Boolean(errors[`review-${decision}`]) && (
        <ErrorNotice error={errors[`review-${decision}`]} />
      )}
      <button
        type="submit"
        className="as-btn"
        disabled={!decision || reason.trim().length < 5 || busy !== null}
      >
        Record decision
      </button>
    </form>
  );
}

export function IncidentDetailView({ api, user, id }: { api: SahayaApi; user: Me; id: string }) {
  const { navigate } = useRoute();
  const link = useStaffLink();
  const detail = useAsync(() => api.getIncident(id), [api, id], 15_000);
  const summary = useAsync(() => api.checkinSummary(id), [api, id], 15_000);
  const dispatches = useAsync(
    hasRole(user, 'RESPONDER', 'ADMIN') ? () => api.listDispatches() : null,
    [api],
    15_000,
  );
  const canVerify = hasRole(user, 'INCIDENT_VERIFIER', 'ADMIN');
  const d = detail.data;
  const related = dispatches.data?.items.filter((x) => x.incidentId === id) ?? [];

  return (
    <>
      <button
        type="button"
        className="as-btn as-btn--ghost as-btn--sm"
        style={{ justifySelf: 'start' }}
        onClick={() => navigate(link('incidents'))}
      >
        <AppIcon name="back" size={16} /> All incidents
      </button>
      {detail.loading && !d && <Loading />}
      {Boolean(detail.error) && <ErrorNotice error={detail.error} onRetry={detail.reload} />}
      {d && (
        <div className="as-split">
          <div className="as-stack">
            <Card
              title={d.type}
              icon="alert"
              labelledBy="as-inc-title"
              action={<VerificationPill status={d.verification_status} />}
            >
              <p>{d.description}</p>
              <dl className="as-kv">
                <dt>Priority</dt>
                <dd>{d.priority}</dd>
                <dt>Mode</dt>
                <dd>{d.mode} (simulated)</dd>
                <dt>Reports</dt>
                <dd>{d.report_count}</dd>
                <dt>Received</dt>
                <dd>{formatWhen(d.created_at)}</dd>
                <dt>Location</dt>
                <dd>{d.zone_id ? 'Zone recorded (see Campus map)' : 'No zone given'}</dd>
              </dl>
            </Card>
            <Card title="Verification" icon="shield" labelledBy="as-inc-verify">
              {d.verification_history.length === 0 ? (
                <p className="as-muted">No reviewer decision yet.</p>
              ) : (
                <ul className="as-list">
                  {d.verification_history.map((r) => (
                    <li key={r.id} className="as-item">
                      <span className="as-item__title">
                        {r.from_status} → {r.to_status}
                      </span>
                      <span className="as-muted as-small">
                        {formatWhen(r.created_at)} · {r.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {canVerify ? (
                <ReviewForm
                  api={api}
                  id={id}
                  current={d.verification_status}
                  onDone={detail.reload}
                />
              ) : (
                <p className="as-muted as-small">
                  Only incident verifiers and administrators can record decisions.
                </p>
              )}
            </Card>
          </div>
          <div className="as-stack">
            <Card title="Roll-call (check-ins)" icon="users" labelledBy="as-inc-roll">
              {summary.loading && !summary.data && <Loading />}
              {Boolean(summary.error) && (
                <ErrorNotice error={summary.error} onRetry={summary.reload} />
              )}
              {summary.data && (
                <>
                  <div className="as-grid2">
                    <Stat value={summary.data.counts.CONFIRMED_SAFE} label="Confirmed safe" />
                    <Stat value={summary.data.counts.HELP_REQUESTED} label="Help requested" />
                    <Stat value={summary.data.counts.UNCONFIRMED} label="Unconfirmed" />
                  </div>
                  <p className="as-muted as-small">{summary.data.note}</p>
                </>
              )}
            </Card>
            {dispatches.data && (
              <Card title="Simulated dispatch" icon="truck" labelledBy="as-inc-dispatch">
                {related.length === 0 ? (
                  <p className="as-muted">
                    No simulated dispatch (created automatically for high/critical priority).
                  </p>
                ) : (
                  related.map((x) => (
                    <div key={x.id} className="as-row as-row--between">
                      <span>{x.responseCategory}</span>
                      <Pill tone="info">{x.status} · simulated</Pill>
                    </div>
                  ))
                )}
                <button
                  type="button"
                  className="as-linkbtn as-small"
                  style={{ justifySelf: 'start' }}
                  onClick={() => navigate(link('dispatches'))}
                >
                  Open dispatches
                </button>
              </Card>
            )}
            {hasRole(user, 'ADMIN') && (
              <Card title="Alert affected zone" icon="bell" labelledBy="as-inc-alert">
                <AlertComposer
                  api={api}
                  mode={user.mode}
                  incidentId={id}
                  defaultZoneId={d.zone_id}
                  onDone={() => navigate(link('alerts'))}
                />
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
export function HelpRequestsView({ api, user }: { api: SahayaApi; user: Me }) {
  const [status, setStatus] = useState<HelpRequestStatus | 'ACTIVE'>('ACTIVE');
  const list = useAsync(
    () => api.listHelpRequests(status === 'ACTIVE' ? undefined : status),
    [api, status],
    10_000,
  );
  const { run, busy, errors } = useActions();
  const isResponder = hasRole(user, 'RESPONDER');
  const isAdmin = hasRole(user, 'ADMIN');
  const items = (list.data?.items ?? []).filter(
    (h) => status !== 'ACTIVE' || (h.status !== 'RESOLVED' && h.status !== 'CANCELLED'),
  );

  const actionsFor = (h: HelpRequest): { action: HelpAction; label: string }[] => {
    const out: { action: HelpAction; label: string }[] = [];
    if (h.status === 'OPEN' && (isResponder || isAdmin))
      out.push({ action: 'acknowledge', label: 'Acknowledge' });
    if ((h.status === 'OPEN' || h.status === 'ACKNOWLEDGED') && isResponder)
      out.push({ action: 'assign', label: 'Assign to me' });
    if (h.status === 'ASSIGNED' && (isResponder || isAdmin))
      out.push({ action: 'resolve', label: 'Resolve' });
    if ((h.status === 'OPEN' || h.status === 'ACKNOWLEDGED' || h.status === 'ASSIGNED') && isAdmin)
      out.push({ action: 'cancel', label: 'Cancel' });
    return out;
  };

  return (
    <Card
      title="Persistent help requests"
      icon="hand"
      labelledBy="as-help-list"
      action={
        <div className="as-seg" role="group" aria-label="Status filter">
          {(['ACTIVE', 'OPEN', 'ACKNOWLEDGED', 'ASSIGNED', 'RESOLVED'] as const).map((s) => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
              {s === 'ACTIVE' ? 'Active' : HELP_STATUS[s].label.split(' ·')[0]}
            </button>
          ))}
        </div>
      }
    >
      <p className="as-muted as-small">
        Requests stay open until resolved. Responders see only their assigned zone; the server
        enforces zone and role rules.
      </p>
      {list.loading && !list.data && <Loading />}
      {Boolean(list.error) && <ErrorNotice error={list.error} onRetry={list.reload} />}
      {list.data && items.length === 0 && (
        <EmptyState icon="check" title="No help requests in this view." />
      )}
      <ul className="as-list">
        {items.map((h) => (
          <li key={h.id} className="as-item">
            <div className="as-row as-row--between">
              <HelpStatusPill status={h.status} />
              <span className="as-muted as-small">Opened {formatWhen(h.createdAt)}</span>
            </div>
            {h.details && <p style={{ whiteSpace: 'pre-line' }}>{h.details}</p>}
            <p className="as-muted as-small">
              {h.incidentId ? 'Incident' : 'Drill'} · {h.zoneId ? 'zone recorded' : 'no zone'} ·{' '}
              {h.acknowledgedAt && `acknowledged ${formatWhen(h.acknowledgedAt)} · `}
              {h.assignedAt && `assigned ${formatWhen(h.assignedAt)} · `}
              {h.resolvedAt && `resolved ${formatWhen(h.resolvedAt)}`}
            </p>
            <div className="as-row">
              {actionsFor(h).map(({ action, label }) => (
                <button
                  key={action}
                  type="button"
                  className={`as-btn as-btn--sm${action === 'cancel' ? ' as-btn--ghost' : action === 'resolve' ? ' as-btn--ok' : ''}`}
                  disabled={busy !== null}
                  onClick={() =>
                    void run(
                      `${h.id}:${action}`,
                      (key) => api.transitionHelpRequest(h.id, action, key),
                      list.reload,
                    )
                  }
                >
                  {busy === `${h.id}:${action}` ? 'Saving…' : label}
                </button>
              ))}
            </div>
            {actionsFor(h).map(({ action }) =>
              errors[`${h.id}:${action}`] ? (
                <ErrorNotice key={action} error={errors[`${h.id}:${action}`]} />
              ) : null,
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------
export function DispatchesView({ api }: { api: SahayaApi }) {
  const list = useAsync(() => api.listDispatches(), [api], 15_000);
  const { run, busy, errors } = useActions();
  const { navigate } = useRoute();
  const link = useStaffLink();
  return (
    <Card title="Simulated dispatches" icon="truck" labelledBy="as-disp">
      <p className="as-notice as-notice--warn">
        SIMULATED. Dispatch records are created for high/critical incidents and processed by a local
        simulated adapter. No real emergency service, siren or responder device is contacted.
      </p>
      {list.loading && !list.data && <Loading />}
      {Boolean(list.error) && <ErrorNotice error={list.error} onRetry={list.reload} />}
      {list.data?.items.length === 0 && <EmptyState title="No dispatches yet." />}
      <ul className="as-list">
        {list.data?.items.map((d) => (
          <li key={d.id} className="as-item">
            <div className="as-row as-row--between">
              <span className="as-item__title">{d.responseCategory}</span>
              <Pill
                tone={
                  d.status === 'ACCEPTED'
                    ? 'ok'
                    : d.status === 'CREATED' || d.status === 'NOTIFIED'
                      ? 'warn'
                      : 'neutral'
                }
              >
                {d.status} · simulated
              </Pill>
            </div>
            <span className="as-muted as-small">
              Created {formatWhen(d.createdAt)}
              {d.acknowledgedAt && ` · accepted ${formatWhen(d.acknowledgedAt)}`}
            </span>
            <div className="as-row">
              {d.status === 'CREATED' && (
                <span className="as-muted as-small">Awaiting the simulated notification step…</span>
              )}
              {['NOTIFIED', 'ESCALATED'].includes(d.status) && (
                <button
                  type="button"
                  className="as-btn as-btn--sm"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(d.id, (key) => api.acknowledgeDispatch(d.id, key), list.reload)
                  }
                >
                  {busy === d.id ? 'Saving…' : 'Accept (simulated)'}
                </button>
              )}
              <button
                type="button"
                className="as-btn as-btn--ghost as-btn--sm"
                onClick={() => navigate(link('incidents', d.incidentId))}
              >
                Incident
              </button>
            </div>
            {Boolean(errors[d.id]) && <ErrorNotice error={errors[d.id]} />}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function AlertComposer({
  api,
  mode,
  incidentId,
  defaultZoneId,
  onDone,
}: {
  api: SahayaApi;
  mode: Me['mode'];
  incidentId?: string;
  defaultZoneId?: string | null;
  onDone: () => void;
}) {
  const buildings = useAsync(() => api.buildings(), [api]);
  const firstBuilding = buildings.data?.items[0]?.id;
  const map = useAsync(firstBuilding ? () => api.buildingMap(firstBuilding) : null, [
    api,
    firstBuilding,
  ]);
  const zones = useMemo(
    () => map.data?.floors.flatMap((f) => f.zones.map((z) => ({ ...z, floor: f.name }))) ?? [],
    [map.data],
  );
  const [zoneIds, setZoneIds] = useState<string[]>(defaultZoneId ? [defaultZoneId] : []);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [precautionary, setPrecautionary] = useState(true);
  const { run, busy, errors } = useActions();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(
      'compose',
      (key) =>
        api.createAlert(
          {
            ...(incidentId ? { incidentId } : {}),
            zoneIds,
            title: title.trim(),
            message: message.trim(),
            precautionary,
            mode,
          },
          key,
        ),
      () => {
        setTitle('');
        setMessage('');
        onDone();
      },
    );
  };
  return (
    <form className="as-form" onSubmit={submit}>
      <p className="as-muted as-small">
        Creates a DRAFT. It reaches students only after an administrator authorises it for simulated
        delivery. Do not include evacuation routes or assembly points unless officially approved.
      </p>
      <fieldset className="as-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>Zones</legend>
        {map.loading && !map.data && <Loading />}
        {zones.map((z) => (
          <label key={z.id} className="as-check">
            <input
              type="checkbox"
              checked={zoneIds.includes(z.id)}
              onChange={(e) =>
                setZoneIds((ids) =>
                  e.target.checked ? [...ids, z.id] : ids.filter((x) => x !== z.id),
                )
              }
            />
            {z.name} · {z.floor}
          </label>
        ))}
      </fieldset>
      <label className="as-field">
        Title
        <input
          className="as-input"
          value={title}
          minLength={3}
          maxLength={140}
          required
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="as-field">
        Message
        <textarea
          className="as-textarea"
          value={message}
          minLength={3}
          maxLength={2000}
          required
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>
      <label className="as-check">
        <input
          type="checkbox"
          checked={precautionary}
          onChange={(e) => setPrecautionary(e.target.checked)}
        />
        Precautionary
      </label>
      {Boolean(errors.compose) && <ErrorNotice error={errors.compose} />}
      <button
        type="submit"
        className="as-btn"
        disabled={
          zoneIds.length === 0 ||
          title.trim().length < 3 ||
          message.trim().length < 3 ||
          busy !== null
        }
      >
        Create {mode} alert draft
      </button>
    </form>
  );
}

export function AlertsView({ api, user }: { api: SahayaApi; user: Me }) {
  const list = useAsync(() => api.listAlerts(), [api], 15_000);
  const { run, busy, errors } = useActions();
  const isAdmin = hasRole(user, 'ADMIN');
  return (
    <div className="as-split">
      <Card title="Alerts" icon="bell" labelledBy="as-alerts-staff">
        {list.loading && !list.data && <Loading />}
        {Boolean(list.error) && <ErrorNotice error={list.error} onRetry={list.reload} />}
        {list.data?.items.length === 0 && <EmptyState title="No alerts yet." />}
        <ul className="as-list">
          {list.data?.items.map((a) => (
            <li key={a.id} className="as-item">
              <div className="as-row as-row--between">
                <span className="as-item__title">{a.title}</span>
                <Pill
                  tone={a.status === 'DRAFT' ? 'warn' : a.status === 'QUEUED' ? 'info' : 'neutral'}
                >
                  {a.status}
                </Pill>
              </div>
              <p className="as-muted">{a.message}</p>
              <span className="as-muted as-small">
                {a.mode} · {a.zoneCount} zone(s) · {a.recipientCount} recipient(s) ·{' '}
                {a.acknowledgedCount} acknowledged ·{' '}
                {a.incidentId ? 'linked to incident' : 'no incident'} · {formatWhen(a.createdAt)}
              </span>
              {isAdmin && a.status === 'DRAFT' && (
                <button
                  type="button"
                  className="as-btn as-btn--sm"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(a.id, (key) => api.authorizeAlert(a.id, key), list.reload)
                  }
                >
                  {busy === a.id ? 'Authorising…' : 'Authorise for simulated delivery'}
                </button>
              )}
              {Boolean(errors[a.id]) && <ErrorNotice error={errors[a.id]} />}
            </li>
          ))}
        </ul>
      </Card>
      {isAdmin ? (
        <Card title="New zone alert" icon="plus" labelledBy="as-alerts-new">
          <AlertComposer api={api} mode={user.mode} onDone={list.reload} />
        </Card>
      ) : (
        <Card title="Creating alerts" icon="info" labelledBy="as-alerts-info">
          <p className="as-muted">
            Only administrators can draft and authorise alerts. Responders and verifiers can see
            delivery and acknowledgement counts.
          </p>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function PacksView({ api, user }: { api: SahayaApi; user: Me }) {
  const list = useAsync(() => api.packReviewQueue(), [api]);
  const { run, busy, errors } = useActions();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const isAdmin = hasRole(user, 'ADMIN');
  return (
    <Card title="Instruction pack review" icon="book" labelledBy="as-packs">
      <p className="as-muted">
        Students and Tom see only PUBLISHED packs. Review the content and its source before
        approving; never approve invented evacuation routes or assembly points.
      </p>
      {list.loading && !list.data && <Loading />}
      {Boolean(list.error) && <ErrorNotice error={list.error} onRetry={list.reload} />}
      {list.data?.items.length === 0 && <EmptyState title="No packs awaiting review." />}
      <ul className="as-list">
        {list.data?.items.map((p) => {
          const sections = Array.isArray(p.content.sections)
            ? (p.content.sections as { heading?: string; body?: string }[])
            : [];
          return (
            <li key={p.id} className="as-item">
              <div className="as-row as-row--between">
                <span className="as-item__title">
                  {p.title}{' '}
                  <span className="as-muted">
                    v{p.version} · {p.language}
                  </span>
                </span>
                <Pill
                  tone={
                    p.approvalState === 'PUBLISHED'
                      ? 'ok'
                      : p.approvalState === 'APPROVED'
                        ? 'info'
                        : 'warn'
                  }
                >
                  {p.approvalState}
                </Pill>
              </div>
              <span className="as-muted as-small">Source: {p.sourceLabel}</span>
              <details>
                <summary>Content</summary>
                {sections.map((s, i) => (
                  <p key={i}>
                    <strong>{s.heading}</strong> {s.body}
                  </p>
                ))}
              </details>
              {p.approvalState === 'DRAFT' && (
                <div className="as-form">
                  <label className="as-field">
                    Review notes
                    <input
                      className="as-input"
                      value={notes[p.id] ?? ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))}
                    />
                  </label>
                  <div className="as-row">
                    {(['APPROVE', 'REJECT'] as const).map((decision) => (
                      <button
                        key={decision}
                        type="button"
                        className={`as-btn as-btn--sm${decision === 'REJECT' ? ' as-btn--ghost' : ''}`}
                        disabled={busy !== null || (notes[p.id] ?? '').trim().length < 3}
                        onClick={() =>
                          void run(
                            `${p.id}:${decision}`,
                            (key) =>
                              api.reviewPack(
                                p.id,
                                { decision, notes: (notes[p.id] ?? '').trim() },
                                key,
                              ),
                            list.reload,
                          )
                        }
                      >
                        {decision === 'APPROVE' ? 'Approve' : 'Reject'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {p.approvalState === 'APPROVED' &&
                (isAdmin ? (
                  <button
                    type="button"
                    className="as-btn as-btn--sm"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(`${p.id}:publish`, (key) => api.publishPack(p.id, key), list.reload)
                    }
                  >
                    Publish to students
                  </button>
                ) : (
                  <p className="as-muted as-small">Approved. An administrator must publish it.</p>
                ))}
              {['APPROVE', 'REJECT', 'publish'].map((a) =>
                errors[`${p.id}:${a}`] ? (
                  <ErrorNotice key={a} error={errors[`${p.id}:${a}`]} />
                ) : null,
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------
export function MapView({ api, user }: { api: SahayaApi; user: Me }) {
  const incidents = useAsync(() => api.listIncidents(100), [api], 20_000);
  const items = useMemo(
    () =>
      (incidents.data?.items ?? []).map((i) => ({
        id: i.id,
        type: i.type,
        verificationStatus: i.verificationStatus,
        buildingId: i.buildingId,
        zoneId: i.zoneId,
      })),
    [incidents.data],
  );
  const alerts = useAsync(() => api.listAlerts(), [api], 20_000);
  const activeAlerts = useMemo<MapAlert[]>(
    () =>
      (alerts.data?.items ?? [])
        .filter((a) => isActiveAlert(a.status))
        .map((a) => ({
          id: a.id,
          title: a.title,
          buildingIds: [
            ...a.areaBuildingIds,
            ...(a.incidentBuildingId ? [a.incidentBuildingId] : []),
          ],
        })),
    [alerts.data],
  );
  return (
    <>
      {Boolean(incidents.error) && (
        <ErrorNotice error={incidents.error} onRetry={incidents.reload} />
      )}
      <CampusMapPanel
        api={api}
        incidents={items}
        alerts={activeAlerts}
        canMarkBlocked={hasRole(user, 'RESPONDER', 'ADMIN')}
      />
    </>
  );
}

export function ContactsPage() {
  return (
    <div className="sc-ops" style={{ background: 'transparent' }}>
      <ContactsView contacts={CAMPUS_CONTACTS} resources={OFFICIAL_RESOURCES} mode="DEMO" />
    </div>
  );
}
