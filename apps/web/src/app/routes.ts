import type { Role } from '@sahaya/contracts';

/**
 * One route tree for the three role experiences (hash routes, so the PWA's
 * offline app shell and static hosting need no server rewrites).
 *
 *   /auth/*       sign-in (Phase 1: DEMO login only)
 *   /student/*    student PWA
 *   /responder/*  responder workspace (staff roles)
 *   /admin/*      administration (ADMIN only)
 *   /help         support (public)
 *   /legal/*      privacy and prototype notices (public)
 *
 * Frontend route guards only choose what to render. They are not a security
 * boundary: the API authorises every request by the server-issued roles.
 */
export const ROUTES = {
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    verify: '/auth/verify',
  },
  student: {
    root: '/student',
    home: '/student/home',
    map: '/student/map',
    alerts: '/student/alerts',
    prepare: '/student/prepare',
    profile: '/student/profile',
    report: '/student/report',
    sos: '/student/sos',
  },
  responder: {
    root: '/responder',
    overview: '/responder/overview',
    incidents: '/responder/incidents',
    help: '/responder/help',
    dispatches: '/responder/dispatches',
    alerts: '/responder/alerts',
    packs: '/responder/packs',
    drills: '/responder/drills',
    map: '/responder/map',
    insights: '/responder/insights',
    contacts: '/responder/contacts',
  },
  admin: {
    root: '/admin',
    dashboard: '/admin/dashboard',
  },
  help: '/help',
  legal: {
    privacy: '/legal/privacy',
    prototype: '/legal/prototype',
  },
} as const;

export type Area = 'root' | 'auth' | 'student' | 'responder' | 'admin' | 'help' | 'legal';

const AREAS: readonly Area[] = ['auth', 'student', 'responder', 'admin', 'help', 'legal'];

export function areaOf(path: string): Area | 'unknown' {
  const first = path.split('/').filter(Boolean)[0];
  if (!first) return 'root';
  return (AREAS as readonly string[]).includes(first) ? (first as Area) : 'unknown';
}

/** Areas that render the same for everyone, signed in or not. */
export function isPublicArea(area: Area | 'unknown'): boolean {
  return area === 'help' || area === 'legal';
}

export const STAFF_ROLES: readonly Role[] = [
  'RESPONDER',
  'INCIDENT_VERIFIER',
  'DRILL_MANAGER',
  'ADMIN',
];

/** Which signed-in roles may open each protected area (advisory; the API decides). */
export const AREA_ROLES: Record<'student' | 'responder' | 'admin', readonly Role[]> = {
  student: ['STUDENT'],
  responder: STAFF_ROLES,
  admin: ['ADMIN'],
};

export function canEnter(area: 'student' | 'responder' | 'admin', roles: readonly Role[]): boolean {
  return AREA_ROLES[area].some((role) => roles.includes(role));
}

/** The landing route for a signed-in user. */
export function homeFor(roles: readonly Role[]): string {
  if (roles.includes('ADMIN')) return ROUTES.admin.dashboard;
  if (canEnter('responder', roles)) return ROUTES.responder.overview;
  return ROUTES.student.home;
}

/**
 * Paths from the pre-2.0 app ("#/home", "#/r/incidents/…"), so bookmarks,
 * installed-app start URLs and Tom history keep working.
 */
const LEGACY_STUDENT = new Set(['home', 'map', 'alerts', 'prepare', 'profile', 'report', 'sos']);

export function legacyRedirect(path: string): string | null {
  const segments = path.split('/').filter(Boolean);
  const first = segments[0];
  if (!first) return null;
  if (first === 'r') return ['', 'responder', ...segments.slice(1)].join('/');
  if (first === 'login') return ROUTES.auth.login;
  if (LEGACY_STUDENT.has(first)) return ['', 'student', ...segments].join('/');
  return null;
}
