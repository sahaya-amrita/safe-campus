import type { Me } from '../api/sahaya';
import { useRoute } from '../router';
import { ROUTES } from '../routes';
import { AppIcon, StatusBanner, Surface } from '../../design-system';
import type { StaffNavItem } from '../staff/StaffLayout';
import { PLANNED_ADMIN_SECTIONS } from './plannedSections';

/**
 * Admin landing page. It lists only what exists: sections backed by real
 * endpoints, and the planned ones clearly marked as not built. No invented
 * statistics.
 */
export function AdminDashboard({ user, nav }: { user: Me; nav: readonly StaffNavItem[] }) {
  const { navigate } = useRoute();
  const sections = nav.filter((n) => n.id !== 'admin.dashboard');
  return (
    <div className="as-stack">
      <StatusBanner tone="info" title={`Signed in as ${user.displayName}`}>
        {user.mode} mode. Every change is authorised and audited by the API; this console only shows
        what your roles allow.
      </StatusBanner>

      <Surface title="Manage" description="Sections connected to the API today.">
        <ul className="as-admin-links">
          {sections.map((item) => (
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
