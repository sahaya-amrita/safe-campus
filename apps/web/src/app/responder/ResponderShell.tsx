import { BRAND } from '../../brand';
import type { Role } from '@sahaya/contracts';
import type { Me } from '../api/sahaya';
import { hasRole, useApi, useSession } from '../auth/session';
import { useRoute } from '../router';
import { TomHost, type AppDestination } from '../TomHost';
import { AppIcon, ModeBanner, Pill, type AppIconName } from '../ui';
import {
  AlertsView,
  ContactsPage,
  DispatchesView,
  HelpRequestsView,
  IncidentDetailView,
  IncidentsView,
  MapView,
  OverviewView,
  PacksView,
} from './views';

interface NavItem {
  id: string;
  path: string;
  label: string;
  icon: AppIconName;
  description: string;
  keywords: string[];
  /** Advisory: hides links the role cannot use. The API enforces access regardless. */
  roles: Role[];
}

const ALL_STAFF: Role[] = ['RESPONDER', 'INCIDENT_VERIFIER', 'DRILL_MANAGER', 'ADMIN'];

export const RESPONDER_NAV: NavItem[] = [
  {
    id: 'responder.overview',
    path: '/r/overview',
    label: 'Overview',
    icon: 'grid',
    description: 'Live counts and the simulated incident starter.',
    keywords: ['overview', 'dashboard', 'summary'],
    roles: ALL_STAFF,
  },
  {
    id: 'responder.incidents',
    path: '/r/incidents',
    label: 'Incidents',
    icon: 'alert',
    description: 'Incident queue, details, verification and roll-call.',
    keywords: ['incident', 'verify', 'review', 'hazard', 'report'],
    roles: ['RESPONDER', 'INCIDENT_VERIFIER', 'ADMIN'],
  },
  {
    id: 'responder.help-requests',
    path: '/r/help',
    label: 'Help requests',
    icon: 'hand',
    description: 'Persistent student help requests: acknowledge, assign, resolve.',
    keywords: ['help', 'request', 'acknowledge', 'assign', 'resolve'],
    roles: ['RESPONDER', 'INCIDENT_VERIFIER', 'ADMIN'],
  },
  {
    id: 'responder.dispatches',
    path: '/r/dispatches',
    label: 'Dispatches',
    icon: 'truck',
    description: 'Simulated responder dispatches.',
    keywords: ['dispatch', 'simulated'],
    roles: ['RESPONDER', 'ADMIN'],
  },
  {
    id: 'responder.alerts',
    path: '/r/alerts',
    label: 'Alerts',
    icon: 'bell',
    description: 'Zone alerts: drafts, authorisation and acknowledgements.',
    keywords: ['alert', 'zone', 'notify'],
    roles: ['RESPONDER', 'INCIDENT_VERIFIER', 'ADMIN'],
  },
  {
    id: 'responder.packs',
    path: '/r/packs',
    label: 'Instruction packs',
    icon: 'book',
    description: 'Review and publish instruction packs.',
    keywords: ['instruction', 'pack', 'approve', 'publish'],
    roles: ['INCIDENT_VERIFIER', 'ADMIN'],
  },
  {
    id: 'responder.map',
    path: '/r/map',
    label: 'Campus map',
    icon: 'map',
    description: 'Demo digital twin with incident overlay. Not for navigation.',
    keywords: ['map', 'twin', 'campus', 'building'],
    roles: ALL_STAFF,
  },
  {
    id: 'responder.contacts',
    path: '/r/contacts',
    label: 'Contacts',
    icon: 'phone',
    description: 'Campus contacts with verification state.',
    keywords: ['contact', 'phone', 'number'],
    roles: ALL_STAFF,
  },
];

export function ResponderShell({ user }: { user: Me }) {
  const { signOut } = useSession();
  const api = useApi();
  const { path, segments, navigate } = useRoute();
  const nav = RESPONDER_NAV.filter((item) => hasRole(user, ...item.roles));
  const active = nav.find((n) => path === n.path || path.startsWith(`${n.path}/`)) ?? nav[0]!;
  const destinations: AppDestination[] = nav.map((n) => ({
    id: n.id,
    path: n.path,
    label: n.label,
    description: n.description,
    keywords: n.keywords,
    roles: ['RESPONDER', 'ADMIN'],
  }));

  let view;
  switch (active.id) {
    case 'responder.incidents':
      view = segments[2] ? (
        <IncidentDetailView api={api} user={user} id={segments[2]} />
      ) : (
        <IncidentsView api={api} />
      );
      break;
    case 'responder.help-requests':
      view = <HelpRequestsView api={api} user={user} />;
      break;
    case 'responder.dispatches':
      view = <DispatchesView api={api} />;
      break;
    case 'responder.alerts':
      view = <AlertsView api={api} user={user} />;
      break;
    case 'responder.packs':
      view = <PacksView api={api} user={user} />;
      break;
    case 'responder.map':
      view = <MapView api={api} />;
      break;
    case 'responder.contacts':
      view = <ContactsPage />;
      break;
    default:
      view = <OverviewView api={api} user={user} />;
  }

  return (
    <div className="as-staff">
      <a className="as-skip" href="#as-staff-main">
        Skip to content
      </a>
      <aside className="as-side" aria-label="Responder workspace">
        <div className="as-brand">
          <span className="as-topbar__emblem">
            <img src={BRAND.emblemUrl} alt="" width={24} height={28} />
          </span>
          <div>
            <p className="as-brand__name">{BRAND.name}</p>
            <p className="as-brand__tag">Responder workspace</p>
          </div>
        </div>
        <nav aria-label="Sections">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              className="as-side__link"
              aria-current={active.id === item.id ? 'page' : undefined}
              onClick={() => navigate(item.path)}
            >
              <AppIcon name={item.icon} size={18} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="as-side__foot">
          <span>
            {user.displayName}
            <br />
            <small>{user.roles.join(' · ')}</small>
          </span>
          <button
            type="button"
            className="as-btn as-btn--ghost as-btn--sm"
            onClick={() => signOut()}
          >
            <AppIcon name="logout" size={16} /> Sign out
          </button>
        </div>
      </aside>
      <div className="as-staff__main">
        <div>
          <ModeBanner mode={user.mode} />
          <header className="as-staff__head">
            <h1 className="as-screen-title">{active.label}</h1>
            <div className="as-row">
              <Pill tone="neutral">DEMO sign-in · not SSO</Pill>
              <a className="as-btn as-btn--light as-btn--sm" href="tel:112">
                <AppIcon name="phone" size={16} /> 112
              </a>
            </div>
          </header>
        </div>
        <main className="as-staff__content" id="as-staff-main">
          {view}
        </main>
      </div>
      <TomHost user={user} destinations={destinations} currentPath={path} />
    </div>
  );
}
