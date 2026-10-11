import { lazy, Suspense, useEffect } from 'react';
import type { ReactNode } from 'react';
import '../design-system/fonts';
import { Button, ErrorState } from '../design-system';
import type { Me } from './api/sahaya';
import { SessionProvider, useSession } from './auth/session';
import { AuthScreen } from './auth/AuthScreens';
import { appConfig } from './config';
import { redirect, useRoute } from './router';
import {
  ROUTES,
  areaOf,
  canEnter,
  homeFor,
  isPublicArea,
  legacyRedirect,
  type Area,
} from './routes';
import { Loading } from './ui';
import './theme.css';
import { AppUpdateNotice } from './AppUpdateNotice';

const StudentShell = lazy(() =>
  import('./student/StudentShell').then((m) => ({ default: m.StudentShell })),
);
const ResponderShell = lazy(() =>
  import('./responder/ResponderShell').then((m) => ({ default: m.ResponderShell })),
);
const AdminShell = lazy(() =>
  import('./admin/AdminShell').then((m) => ({ default: m.AdminShell })),
);
const PublicPage = lazy(() =>
  import('./public/PublicPages').then((m) => ({ default: m.PublicPage })),
);

/** Where the user wanted to go before signing in (this tab only). */
const RETURN_KEY = 'sahaya.returnTo.v1';

function rememberReturn(path: string): void {
  try {
    sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    // Storage blocked: the user lands on their home screen instead.
  }
}

function readReturn(): string | null {
  try {
    return sessionStorage.getItem(RETURN_KEY);
  } catch {
    return null;
  }
}

function clearReturn(): void {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // Nothing to clear.
  }
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="as-login">
      <div className="as-login__card">{children}</div>
    </div>
  );
}

function Pending({ label = 'Loading…' }: { label?: string }) {
  return (
    <Centered>
      <Loading label={label} />
    </Centered>
  );
}

function Redirect({ to }: { to: string }) {
  useEffect(() => redirect(to), [to]);
  return <Pending />;
}

type RoleArea = 'student' | 'responder' | 'admin';

const AREA_NAME: Record<RoleArea, string> = {
  student: 'the student app',
  responder: 'the responder workspace',
  admin: 'the admin console',
};

function isRoleArea(area: Area | 'unknown' | null): area is RoleArea {
  return area === 'student' || area === 'responder' || area === 'admin';
}

/**
 * Shown when a signed-in role opens another role's area. The API refuses
 * that area's requests anyway; this screen says so plainly instead of
 * rendering a broken workspace.
 */
function AccessDenied({ area, home, reason }: { area: RoleArea; home: string; reason?: string }) {
  return (
    <Centered>
      <ErrorState
        title={`Your account cannot open ${AREA_NAME[area]}`}
        message={reason ?? 'This area needs a role your account does not have.'}
      />
      <Button block onClick={() => redirect(home)}>
        Go to your home screen
      </Button>
    </Centered>
  );
}

/** Renders a role area and forgets any pending "return to" path once it shows. */
function RoleShell({ user, area }: { user: Me; area: RoleArea }) {
  useEffect(() => clearReturn(), []);
  if (area === 'admin') return <AdminShell user={user} />;
  if (area === 'responder') return <ResponderShell user={user} />;
  return <StudentShell user={user} />;
}

/** Signed out on a protected page: remember it, then go to sign-in. */
function ToSignIn({ from }: { from: string | null }) {
  useEffect(() => {
    if (from) rememberReturn(from);
    redirect(ROUTES.auth.login);
  }, [from]);
  return <Pending />;
}

/** Signed in on root, /auth/* or an unknown path: the remembered page if allowed, else home. */
function ContinueSignedIn({ user }: { user: Me }) {
  const wanted = readReturn();
  const wantedArea = wanted ? areaOf(wanted) : null;
  const allowed = wanted !== null && isRoleArea(wantedArea) && canEnter(wantedArea, user.roles);
  return <Redirect to={allowed ? wanted : homeFor(user.roles)} />;
}

function SignedInArea({ user, area }: { user: Me; area: Area | 'unknown' }) {
  if (!isRoleArea(area)) return <ContinueSignedIn user={user} />;
  if (!canEnter(area, user.roles)) return <AccessDenied area={area} home={homeFor(user.roles)} />;
  return <RoleShell user={user} area={area} />;
}

function Gate() {
  const { state } = useSession();
  const { path } = useRoute();
  const legacy = legacyRedirect(path);
  if (legacy) return <Redirect to={legacy} />;

  const area = areaOf(path);
  if (isPublicArea(area)) return <PublicPage path={path} />;

  if (state.status === 'checking') return <Pending label="Checking your session…" />;

  if (state.status === 'signed-out') {
    if (area === 'auth') return <AuthScreen path={path} notice={state.notice} />;
    return <ToSignIn from={isRoleArea(area) ? path : null} />;
  }

  if (state.status === 'mock') {
    // No API configured: only the labelled student mock preview exists.
    if (area === 'student') return <StudentShell user={state.user} />;
    if (area === 'responder' || area === 'admin')
      return (
        <AccessDenied
          area={area}
          home={ROUTES.student.home}
          reason="The offline mock preview includes only the student app. Staff areas need the API."
        />
      );
    return <Redirect to={ROUTES.student.home} />;
  }

  return <SignedInArea user={state.user} area={area} />;
}

export function App({ apiBaseUrl = appConfig.apiBaseUrl }: { apiBaseUrl?: string | null }) {
  return (
    <div className="as-root">
      <AppUpdateNotice />
      <SessionProvider apiBaseUrl={apiBaseUrl}>
        <Suspense fallback={<Pending />}>
          <Gate />
        </Suspense>
      </SessionProvider>
    </div>
  );
}
