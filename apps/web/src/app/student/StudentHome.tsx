import { HomeScreen } from '../../features/student/components/HomeScreen';
import { CampusContacts } from '../../features/student/components/CampusContacts';
import { useRoute } from '../router';
import { ROUTES } from '../routes';
import {
  AppIcon,
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
import { useStudent } from './core';

export function StudentHome() {
  const s = useStudent();
  const { navigate } = useRoute();
  const alerts = s.inbox?.data?.items ?? [];
  const active = alerts.filter((a) => !a.acknowledgedAt);
  const helpers = useAsync(s.api ? () => s.api!.appropriateResponders() : null, [s.api]);
  const latestHelp = s.myHelp?.data?.items[0];

  return (
    <>
      <section className="as-hero" aria-labelledby="as-home-title">
        <h1 id="as-home-title">Hi, {s.user.displayName.split(' ')[0]}</h1>
        {s.mock ? (
          <p>Mock preview: alerts and incidents need a signed-in API session.</p>
        ) : s.inbox?.loading && !s.inbox.data ? (
          <p>Checking alerts…</p>
        ) : active.length > 0 ? (
          <p>
            <strong>
              {active.length === 1 ? '1 alert needs' : `${active.length} alerts need`} your
              attention.
            </strong>{' '}
            Open Alerts to read and acknowledge.
          </p>
        ) : (
          <p>
            No unacknowledged alerts sent to you in this app. That does not mean campus is safe —
            follow alarms, staff and official channels.
          </p>
        )}
        {active[0] && (
          <button
            type="button"
            className="as-btn as-btn--light as-btn--sm"
            onClick={() => navigate(ROUTES.student.alerts)}
          >
            <AppIcon name="bell" size={16} /> {active[0].title}
            {active[0].incidentVerificationStatus && (
              <VerificationPill status={active[0].incidentVerificationStatus} />
            )}
          </button>
        )}
      </section>

      <Card title="Checking in for" icon="clock" labelledBy="as-home-context">
        {s.mock ? (
          <p className="as-muted">Mock preview uses a simulated drill.</p>
        ) : s.sessions === null ? (
          <Loading label="Finding incidents and drills you can check in to…" />
        ) : s.sessions.length === 0 ? (
          <p className="as-muted">
            No incident or drill is open for you in the app. “I’m safe” needs one; “I need help” is
            still sent to the server as a personal SOS. You can also report a problem or call 112.
          </p>
        ) : (
          <label className="as-field">
            <span className="as-sr-only">Event</span>
            <select
              className="as-select"
              value={s.session?.id ?? ''}
              onChange={(e) => s.chooseSession(e.target.value)}
            >
              {s.sessions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.kind === 'drill' ? 'Drill · ' : 'Incident · '}
                  {option.name} ({option.mode})
                </option>
              ))}
            </select>
            <small>
              You do not need to report an incident first. Check-ins are not proof of safety;
              “Unconfirmed” never means missing.
            </small>
          </label>
        )}
      </Card>

      <div className="as-checkin-host">
        <HomeScreen
          ready={s.checkIns.snapshot.ready}
          submitting={s.checkIns.submitting}
          session={s.sessionView}
          latest={s.entries[0]}
          repeatOf={s.repeatOf}
          storageFailed={s.checkIns.snapshot.storageFailed}
          onSafe={() => void s.send({ status: 'CONFIRMED_SAFE' })}
          onHelp={s.openHelp}
          onRetry={s.checkIns.retry}
          photoCount={s.photoCount}
          photoStatus={s.photoStatus}
          helpStatus={(id) => s.myHelp?.data?.items.find((h) => h.id === id)?.status ?? null}
          onDeletePhotos={s.deletePhotos}
        />
      </div>

      {latestHelp && (
        <Card title="My latest help request" icon="hand" labelledBy="as-home-help">
          <div className="as-row as-row--between">
            <HelpStatusPill status={latestHelp.status} />
            <span className="as-muted as-small">Updated {formatWhen(latestHelp.updatedAt)}</span>
          </div>
          <p className="as-muted as-small">
            Status recorded by the server. Acknowledged/assigned is set by a verified DEMO
            responder; it is not a dispatch of emergency services.
          </p>
        </Card>
      )}

      <div className="as-quick">
        <button type="button" onClick={() => navigate(ROUTES.student.report)}>
          <AppIcon name="report" size={22} /> Report incident{' '}
          <small>Unverified until reviewed</small>
        </button>
        <button type="button" onClick={() => navigate(ROUTES.student.sos)}>
          <AppIcon name="alert" size={22} /> Emergency SOS{' '}
          <small>Call 112 · send help request</small>
        </button>
        <button type="button" onClick={() => navigate(ROUTES.student.prepare)}>
          <AppIcon name="book" size={22} /> Prepare <small>Instructions & drills</small>
        </button>
        <button type="button" onClick={() => navigate(ROUTES.student.map)}>
          <AppIcon name="map" size={22} /> Campus map <small>Demo · not for navigation</small>
        </button>
      </div>

      <Card title="Verified helpers" icon="users" labelledBy="as-home-helpers">
        {!s.api ? (
          <p className="as-muted">Available after signing in to the API.</p>
        ) : helpers.loading && !helpers.data ? (
          <Loading />
        ) : helpers.error ? (
          <ErrorNotice error={helpers.error} onRetry={helpers.reload} />
        ) : helpers.data?.items.length ? (
          <ul className="as-list">
            {helpers.data.items.map((h) => (
              <li key={h.id} className="as-item">
                <div className="as-row as-row--between">
                  <span className="as-item__title">{h.displayName}</span>
                  <Pill tone={h.availability === 'AVAILABLE' ? 'ok' : 'neutral'}>
                    {h.availability}
                  </Pill>
                </div>
                <span className="as-muted as-small">
                  {h.approvedRole} · verified in the system · contact via in-app help request only
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No verified helpers are listed for your area." />
        )}
        <p className="as-muted as-small">
          Responder records are fictional DEMO data, not real campus staff.
        </p>
      </Card>

      <div className="as-card">
        <CampusContacts />
      </div>
    </>
  );
}
