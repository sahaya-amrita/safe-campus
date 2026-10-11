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
import { humanize } from '../labels';

export function StudentHome() {
  const s = useStudent();
  const { navigate } = useRoute();
  const alerts = s.inbox?.data?.items ?? [];
  const active = alerts.filter((a) => !a.acknowledgedAt);
  const helpers = useAsync(s.api ? () => s.api!.appropriateResponders() : null, [s.api]);
  const latestHelp = s.myHelp?.data?.items[0];

  const first = s.user.displayName.split(' ')[0];

  return (
    <>
      <section className="as-greet" aria-labelledby="as-home-title">
        <h1 id="as-home-title">Hi, {first}</h1>
        {s.mock ? (
          <p>Mock preview: alerts and incidents need a signed-in API session.</p>
        ) : s.inbox?.loading && !s.inbox.data ? (
          <p>Checking alerts…</p>
        ) : active.length === 0 ? (
          <p>
            No alerts for you right now. That does not mean campus is safe: follow alarms and staff.
          </p>
        ) : null}
      </section>

      {active[0] && (
        <button
          type="button"
          className="as-alertcard"
          onClick={() => navigate(ROUTES.student.alerts)}
        >
          <span className="as-alertcard__icon" aria-hidden="true">
            <AppIcon name="bell" size={20} />
          </span>
          <span className="as-alertcard__text">
            <strong>{active[0].title}</strong>
            <small>
              {active.length === 1 ? '1 alert needs' : `${active.length} alerts need`} your
              attention · tap to read
            </small>
          </span>
          {active[0].incidentVerificationStatus && (
            <VerificationPill status={active[0].incidentVerificationStatus} />
          )}
        </button>
      )}

      <section className="as-context" aria-labelledby="as-home-context">
        <h2 id="as-home-context" className="as-context__label">
          Checking in for
        </h2>
        {s.mock ? (
          <p className="as-muted as-small">Mock preview uses a simulated drill.</p>
        ) : s.sessions === null ? (
          <Loading label="Finding incidents and drills you can check in to…" />
        ) : s.sessions.length === 0 ? (
          <p className="as-muted as-small">
            Nothing is open for you right now. “I’m safe” needs an incident or drill; “I need help”
            still reaches the server as a personal SOS.
          </p>
        ) : (
          <label className="as-field as-context__field">
            <span className="as-sr-only">Event</span>
            <select
              className="as-select as-context__select"
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
          </label>
        )}
      </section>

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

      <p className="as-small as-muted as-home-note">
        Check-ins are not proof of safety. “Unconfirmed” never means missing.
      </p>

      <nav className="as-shortcuts" aria-label="Shortcuts">
        <button type="button" onClick={() => navigate(ROUTES.student.report)}>
          <AppIcon name="report" size={22} />
          <span>Report incident</span>
          <small>Unverified until reviewed</small>
        </button>
        <button type="button" onClick={() => navigate(ROUTES.student.prepare)}>
          <AppIcon name="book" size={22} />
          <span>Prepare</span>
          <small>Guides and practice</small>
        </button>
        <button type="button" onClick={() => navigate(ROUTES.student.map)}>
          <AppIcon name="map" size={22} />
          <span>Campus map</span>
          <small>DEMO practice routes</small>
        </button>
        <button type="button" onClick={() => navigate(ROUTES.student.alerts)}>
          <AppIcon name="bell" size={22} />
          <span>Alerts</span>
          <small>{active.length > 0 ? `${active.length} to read` : 'Nothing new'}</small>
        </button>
      </nav>

      <details className="as-card as-details as-fold">
        <summary>
          <AppIcon name="users" size={20} /> Who can respond{' '}
          <small className="as-muted">
            {helpers.data ? `${helpers.data.items.length} listed` : ''}
          </small>
        </summary>
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
                  {humanize(h.approvedRole)} · verified in the system · contact via in-app help
                  request only
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
      </details>

      <div className="as-card">
        <CampusContacts />
      </div>
    </>
  );
}
