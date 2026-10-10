import { lazy, Suspense } from 'react';
import { SessionProvider, isStaff, useSession } from './auth/session';
import { LoginScreen } from './LoginScreen';
import { appConfig } from './config';
import { Loading } from './ui';
import './theme.css';

const StudentShell = lazy(() =>
  import('./student/StudentShell').then((m) => ({ default: m.StudentShell })),
);
const ResponderShell = lazy(() =>
  import('./responder/ResponderShell').then((m) => ({ default: m.ResponderShell })),
);

function Gate() {
  const { state } = useSession();
  if (state.status === 'checking') {
    return (
      <div className="as-login">
        <div className="as-login__card">
          <Loading label="Checking your session…" />
        </div>
      </div>
    );
  }
  if (state.status === 'signed-out') return <LoginScreen notice={state.notice} />;
  const user = state.user;
  return (
    <Suspense
      fallback={
        <div style={{ padding: 24 }}>
          <Loading />
        </div>
      }
    >
      {/* The UI picks a workspace from the server-issued roles; the API still authorises every call. */}
      {state.status === 'signed-in' && isStaff(user) ? (
        <ResponderShell user={user} />
      ) : (
        <StudentShell user={user} />
      )}
    </Suspense>
  );
}

export function App({ apiBaseUrl = appConfig.apiBaseUrl }: { apiBaseUrl?: string | null }) {
  return (
    <div className="as-root">
      <SessionProvider apiBaseUrl={apiBaseUrl}>
        <Gate />
      </SessionProvider>
    </div>
  );
}
