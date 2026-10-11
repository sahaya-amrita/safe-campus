import type { Me } from '../api/sahaya';
import { useApi } from '../auth/session';
import { useRoute } from '../router';
import { ROUTES } from '../routes';
import { TourTargetProvider } from '../../components/tom';
import { DevPlaceholder } from '../../design-system';
import { RESPONDER_NAV } from '../responder/ResponderShell';
import { DrillsView } from '../responder/drillControl';
import {
  AlertsView,
  ContactsPage,
  IncidentDetailView,
  IncidentsView,
  PacksView,
} from '../responder/views';
import { StaffLayout, activeItem, toDestinations, type StaffNavItem } from '../staff/StaffLayout';
import { AdminDashboard } from './AdminDashboard';
import { AuditPage } from './AuditPage';
import { RosterPage } from './RosterPage';
import { MapDataPage, SafePointsPage } from './NavigationAdmin';
import { UsersPage } from './UsersPage';
import { PLANNED_ADMIN_SECTIONS } from './plannedSections';

const ADMIN = 'ADMIN' as const;

/** Admin sections backed by real, ADMIN-authorised API endpoints today. */
export const ADMIN_NAV: StaffNavItem[] = [
  {
    id: 'admin.dashboard',
    section: 'dashboard',
    path: ROUTES.admin.dashboard,
    label: 'Dashboard',
    icon: 'grid',
    description: 'Admin overview: what can be managed today and what is still planned.',
    keywords: ['admin', 'dashboard', 'overview'],
    roles: [ADMIN],
  },
  {
    id: 'admin.users',
    section: 'users',
    path: `${ROUTES.admin.root}/users`,
    label: 'Users and roles',
    icon: 'users',
    description: 'Find accounts, grant or remove roles, disable accounts. Every change is audited.',
    keywords: ['user', 'role', 'account', 'permission', 'disable'],
    roles: [ADMIN],
  },
  {
    id: 'admin.audit',
    section: 'audit',
    path: `${ROUTES.admin.root}/audit`,
    label: 'Audit log',
    icon: 'file',
    description: 'Read-only record of sign-ins, role changes and other audited actions.',
    keywords: ['audit', 'log', 'history', 'who changed'],
    roles: [ADMIN],
  },
  {
    id: 'admin.responders',
    section: 'responders',
    path: `${ROUTES.admin.root}/responders`,
    label: 'Responder roster',
    icon: 'hand',
    description: 'Add responders, assign zones and verify them. Every change is audited.',
    keywords: ['responder', 'roster', 'zone', 'verify', 'duty'],
    roles: [ADMIN],
  },
  {
    id: 'admin.map-data',
    section: 'map-data',
    path: `${ROUTES.admin.root}/map-data`,
    label: 'Campus map data',
    icon: 'map',
    description: 'Upload route data and approve it (two-person rule).',
    keywords: ['map', 'route', 'graph', 'navigation', 'path'],
    roles: [ADMIN],
  },
  {
    id: 'admin.safe-points',
    section: 'safe-points',
    path: `${ROUTES.admin.root}/safe-points`,
    label: 'Safe-point approvals',
    icon: 'pin',
    description: 'Propose and approve assembly points, shelters and exits (two-person rule).',
    keywords: ['safe point', 'assembly', 'shelter', 'exit', 'approve'],
    roles: [ADMIN],
  },
  {
    id: 'admin.incidents',
    section: 'incidents',
    path: `${ROUTES.admin.root}/incidents`,
    label: 'Incident verification',
    icon: 'alert',
    description: 'Review reported incidents and record verification decisions.',
    keywords: ['incident', 'verify', 'review', 'hazard'],
    roles: [ADMIN],
  },
  {
    id: 'admin.alerts',
    section: 'alerts',
    path: `${ROUTES.admin.root}/alerts`,
    label: 'Alert management',
    icon: 'bell',
    description: 'Draft and authorise zone alerts. DEMO mode delivers nothing outside the app.',
    keywords: ['alert', 'zone', 'notify', 'publish'],
    roles: [ADMIN],
  },
  {
    id: 'admin.drills',
    section: 'drills',
    path: `${ROUTES.admin.root}/drills`,
    label: 'Drill management',
    icon: 'clock',
    description: 'Plan, start and stop drills, including the STOP DRILL kill switch.',
    keywords: ['drill', 'exercise', 'stop', 'kill switch'],
    roles: [ADMIN],
  },
  {
    id: 'admin.guides',
    section: 'guides',
    path: `${ROUTES.admin.root}/guides`,
    label: 'Safety guides',
    icon: 'book',
    description: 'Review, approve and publish instruction packs.',
    keywords: ['guide', 'instruction', 'pack', 'approve', 'publish'],
    roles: [ADMIN],
  },
  {
    id: 'admin.contacts',
    section: 'contacts',
    path: `${ROUTES.admin.root}/contacts`,
    label: 'Campus contacts',
    icon: 'phone',
    description: 'Campus contacts with their verification state.',
    keywords: ['contact', 'phone', 'number'],
    roles: [ADMIN],
  },
];

export function AdminShell({ user }: { user: Me }) {
  return (
    <TourTargetProvider>
      <AdminWorkspace user={user} />
    </TourTargetProvider>
  );
}

function AdminWorkspace({ user }: { user: Me }) {
  const api = useApi();
  const { path, segments } = useRoute();
  const section = segments[1] ?? 'dashboard';
  const planned = PLANNED_ADMIN_SECTIONS.find((p) => p.section === section);
  const active = planned ? undefined : activeItem(ADMIN_NAV, path);

  let view;
  if (planned) {
    view = (
      <DevPlaceholder
        title={planned.label}
        phase={planned.phase}
        summary={planned.summary}
        needs={planned.needs}
        headingLevel={2}
      />
    );
  } else {
    switch (active?.id) {
      case 'admin.incidents':
        view = segments[2] ? (
          <IncidentDetailView api={api} user={user} id={segments[2]} />
        ) : (
          <IncidentsView api={api} />
        );
        break;
      case 'admin.users':
        view = <UsersPage api={api} user={user} />;
        break;
      case 'admin.map-data':
        view = <MapDataPage api={api} user={user} />;
        break;
      case 'admin.safe-points':
        view = <SafePointsPage api={api} user={user} />;
        break;
      case 'admin.responders':
        view = <RosterPage api={api} user={user} />;
        break;
      case 'admin.audit':
        view = <AuditPage api={api} />;
        break;
      case 'admin.alerts':
        view = <AlertsView api={api} user={user} />;
        break;
      case 'admin.drills':
        view = <DrillsView api={api} user={user} />;
        break;
      case 'admin.guides':
        view = <PacksView api={api} user={user} />;
        break;
      case 'admin.contacts':
        view = <ContactsPage />;
        break;
      default:
        view = <AdminDashboard user={user} nav={ADMIN_NAV} />;
    }
  }

  // Tom can open admin sections and the responder screens this admin may use.
  const destinations = toDestinations([...ADMIN_NAV, ...RESPONDER_NAV]);

  return (
    <StaffLayout
      user={user}
      api={api}
      base={ROUTES.admin.root}
      workspaceLabel="Admin console"
      nav={ADMIN_NAV}
      active={active}
      title={planned?.label ?? active?.label ?? 'Admin console'}
      destinations={destinations}
      switchTo={{ label: 'Responder workspace', path: ROUTES.responder.overview }}
    >
      {view}
    </StaffLayout>
  );
}
