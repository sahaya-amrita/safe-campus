import type { Role } from '@sahaya/contracts';
import type { Me } from '../api/sahaya';
import { hasRole, useApi } from '../auth/session';
import { useRoute } from '../router';
import { ROUTES, canEnter } from '../routes';
import { TourTargetProvider, useTourTarget } from '../../components/tom';
import { StaffLayout, activeItem, toDestinations, type StaffNavItem } from '../staff/StaffLayout';
import { DrillsView } from './drillControl';
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

const ALL_STAFF: Role[] = ['RESPONDER', 'INCIDENT_VERIFIER', 'DRILL_MANAGER', 'ADMIN'];

export const RESPONDER_NAV: StaffNavItem[] = [
  {
    id: 'responder.overview',
    section: 'overview',
    path: ROUTES.responder.overview,
    label: 'Overview',
    icon: 'grid',
    description: 'Live counts and the simulated incident starter.',
    keywords: ['overview', 'dashboard', 'summary'],
    roles: ALL_STAFF,
  },
  {
    id: 'responder.incidents',
    section: 'incidents',
    path: ROUTES.responder.incidents,
    label: 'Incidents',
    icon: 'alert',
    description: 'Incident queue, details, verification and roll-call.',
    keywords: ['incident', 'verify', 'review', 'hazard', 'report'],
    roles: ['RESPONDER', 'INCIDENT_VERIFIER', 'ADMIN'],
  },
  {
    id: 'responder.help-requests',
    section: 'help',
    path: ROUTES.responder.help,
    label: 'Help requests',
    icon: 'hand',
    description: 'Persistent student help requests: acknowledge, assign, resolve.',
    keywords: ['help', 'request', 'acknowledge', 'assign', 'resolve'],
    roles: ['RESPONDER', 'INCIDENT_VERIFIER', 'ADMIN'],
  },
  {
    id: 'responder.dispatches',
    section: 'dispatches',
    path: ROUTES.responder.dispatches,
    label: 'Dispatches',
    icon: 'truck',
    description: 'Simulated responder dispatches.',
    keywords: ['dispatch', 'simulated'],
    roles: ['RESPONDER', 'ADMIN'],
  },
  {
    id: 'responder.alerts',
    section: 'alerts',
    path: ROUTES.responder.alerts,
    label: 'Alerts',
    icon: 'bell',
    description: 'Zone alerts: drafts, authorisation and acknowledgements.',
    keywords: ['alert', 'zone', 'notify'],
    roles: ['RESPONDER', 'INCIDENT_VERIFIER', 'ADMIN'],
  },
  {
    id: 'responder.packs',
    section: 'packs',
    path: ROUTES.responder.packs,
    label: 'Instruction packs',
    icon: 'book',
    description: 'Review and publish instruction packs.',
    keywords: ['instruction', 'pack', 'approve', 'publish'],
    roles: ['INCIDENT_VERIFIER', 'ADMIN'],
  },
  {
    id: 'responder.drills',
    section: 'drills',
    path: ROUTES.responder.drills,
    label: 'Drills',
    icon: 'clock',
    description: 'Drill console: preflight, start, stop and the STOP DRILL kill switch.',
    keywords: ['drill', 'exercise', 'stop', 'kill switch', 'practice'],
    roles: ALL_STAFF,
  },
  {
    id: 'responder.map',
    section: 'map',
    path: ROUTES.responder.map,
    label: 'Campus map',
    icon: 'map',
    description: 'Risk areas, blocked paths and DEMO safe routes. Not approved navigation.',
    keywords: ['map', 'route', 'blocked', 'risk', 'campus', 'building'],
    roles: ALL_STAFF,
  },
  {
    id: 'responder.contacts',
    section: 'contacts',
    path: ROUTES.responder.contacts,
    label: 'Contacts',
    icon: 'phone',
    description: 'Campus contacts with verification state.',
    keywords: ['contact', 'phone', 'number'],
    roles: ALL_STAFF,
  },
];

/** Tour targets (Tom's guided tour) are registered anywhere inside the workspace. */
export function ResponderShell({ user }: { user: Me }) {
  return (
    <TourTargetProvider>
      <ResponderWorkspace user={user} />
    </TourTargetProvider>
  );
}

function ResponderWorkspace({ user }: { user: Me }) {
  const navTarget = useTourTarget('responder.nav');
  const bannerTarget = useTourTarget('responder.mode-banner');
  const api = useApi();
  const { path, segments } = useRoute();
  const nav = RESPONDER_NAV.filter((item) => hasRole(user, ...item.roles));
  const active = activeItem(nav, path);

  let view;
  switch (active?.id) {
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
      view = <MapView api={api} user={user} />;
      break;
    case 'responder.contacts':
      view = <ContactsPage />;
      break;
    case 'responder.drills':
      view = <DrillsView api={api} user={user} />;
      break;
    default:
      view = <OverviewView api={api} user={user} />;
  }

  return (
    <StaffLayout
      user={user}
      api={api}
      base={ROUTES.responder.root}
      workspaceLabel="Responder workspace"
      nav={nav}
      active={active}
      title={active?.label ?? 'Responder workspace'}
      destinations={toDestinations(nav)}
      switchTo={
        canEnter('admin', user.roles)
          ? { label: 'Admin console', path: ROUTES.admin.dashboard }
          : null
      }
      navRef={navTarget}
      bannerRef={bannerTarget}
    >
      {view}
    </StaffLayout>
  );
}
