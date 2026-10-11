import type { Me, SahayaApi } from '../api/sahaya';
import { useRoute } from '../router';
import { ROUTES } from '../routes';
import { AppIcon, StatusBanner, Surface } from '../../design-system';
import { groupNav, type StaffNavItem } from '../staff/StaffLayout';
import { useAsync } from '../ui';
import { PLANNED_ADMIN_SECTIONS } from './plannedSections';

/**
 * Admin landing page: what needs attention now, then every section grouped.
 * Counts come straight from the API (descriptive only, never estimated); a
 * count that cannot be loaded shows "—" rather than a guess.
 */
export function AdminDashboard({
  user,
  nav,
  api,
}: {
  user: Me;
  nav: readonly StaffNavItem[];
  api?: SahayaApi | null;
}) {
  const { navigate } = useRoute();
  const help = useAsync(api ? () => api.listHelpRequests('OPEN') : null, [api], 30_000);
  const incidents = useAsync(api ? () => api.listIncidents(100) : null, [api], 30_000);
  const drills = useAsync(api ? () => api.drills() : null, [api], 30_000);
  const points = useAsync(api ? () => api.safePoints() : null, [api]);
  const graphs = useAsync(api ? () => api.routeGraphs() : null, [api]);

  const pathOf = (id: string) => nav.find((n) => n.id === id)?.path ?? ROUTES.admin.dashboard;
  const count = (value: number | undefined) => (value === undefined ? '—' : String(value));
  const approvals =
    points.data && graphs.data
      ? points.data.items.filter((p) => p.status === 'PROPOSED').length +
        graphs.data.items.filter((g) => g.status === 'DRAFT').length
      : undefined;

  const tiles = [
    {
      label: 'Open help requests',
      value: count(help.data?.items.length),
      hint: 'Not yet acknowledged or resolved',
      to: `${ROUTES.responder.root}/help`,
      urgent: (help.data?.items.length ?? 0) > 0,
    },
    {
      label: 'Unverified reports',
      value: count(incidents.data?.items.filter((i) => i.verificationStatus === 'REPORTED').length),
      hint: 'Waiting for a verifier',
      to: pathOf('admin.incidents'),
      urgent: false,
    },
    {
      label: 'Approvals waiting',
      value: count(approvals),
      hint: 'Safe points and route data (two-person rule)',
      to: pathOf('admin.safe-points'),
      urgent: false,
    },
    {
      label: 'Drills running',
      value: count(drills.data?.items.filter((d) => d.status === 'ACTIVE').length),
      hint: 'Simulations in progress',
      to: pathOf('admin.drills'),
      urgent: false,
    },
  ];

  const sections = nav.filter((n) => n.id !== 'admin.dashboard');
  return (
    <div className="as-stack">
      <StatusBanner tone="info" title={`Signed in as ${user.displayName}`}>
        {user.mode} mode. Every change is authorised and audited by the API.
      </StatusBanner>

      <section aria-labelledby="as-attention" className="as-attention">
        <h2 id="as-attention" className="as-section-title">
          Needs attention
        </h2>
        <div className="as-attention__grid">
          {tiles.map((t) => (
            <button
              key={t.label}
              type="button"
              className={`as-tile${t.urgent ? ' as-tile--urgent' : ''}`}
              onClick={() => navigate(t.to)}
            >
              <span className="as-tile__value">{t.value}</span>
              <span className="as-tile__label">{t.label}</span>
              <span className="as-tile__hint">{t.hint}</span>
            </button>
          ))}
        </div>
      </section>

      {groupNav(sections).map(({ group, items }) => (
        <Surface key={group ?? 'other'} title={group ?? 'Sections'}>
          <ul className="as-admin-links as-admin-links--grid">
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" className="as-admin-link" onClick={() => navigate(item.path)}>
                  <AppIcon name={item.icon} size={20} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <AppIcon name="chevron" size={18} />
                </button>
              </li>
            ))}
          </ul>
        </Surface>
      ))}

      {PLANNED_ADMIN_SECTIONS.length > 0 && (
        <Surface
          title="Not built yet"
          description="Specified for later phases. These open a placeholder, not a working screen."
        >
          <ul className="as-admin-links">
            {PLANNED_ADMIN_SECTIONS.map((p) => (
              <li key={p.section}>
                <button
                  type="button"
                  className="as-admin-link as-admin-link--planned"
                  onClick={() => navigate(`${ROUTES.admin.root}/${p.section}`)}
                >
                  <AppIcon name="clock" size={20} />
                  <span>
                    <strong>{p.label}</strong>
                    <small>{p.phase}</small>
                  </span>
                  <AppIcon name="chevron" size={18} />
                </button>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}
