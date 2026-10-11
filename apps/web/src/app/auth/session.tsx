import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { Role } from '@sahaya/contracts';
import { ApiClient, ApiError } from '../api/client';
import { sahayaApi, type LoginResult, type Me, type SahayaApi } from '../api/sahaya';
import { STAFF_ROLES } from '../routes';

/**
 * App session. DEMO login only (POST /api/v1/auth/demo-login): it is not
 * institutional SSO. The token lives in sessionStorage so it ends with the
 * tab; the server re-checks it on every request.
 */
export type SessionState =
  | { status: 'checking' }
  | { status: 'signed-out'; notice?: string }
  | { status: 'signed-in'; user: Me; expiresAt: number; warning: string }
  /** No API configured: the student app runs on the labelled mock adapter only. */
  | { status: 'mock'; user: Me };

const STORAGE_KEY = 'sahaya.session.v1';

interface Stored {
  token: string;
  expiresAt: number;
  user: Me;
  warning: string;
}

function readStored(): Stored | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function writeStored(value: Stored | null): void {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the session still works until the page reloads.
  }
}

export const MOCK_USER: Me = {
  id: '00000000-0000-4000-8000-000000000000',
  email: 'mock.student@example.invalid',
  displayName: 'Mock student (offline preview)',
  language: 'en',
  roles: ['STUDENT'],
  mode: 'DEMO',
};

export interface SessionContextValue {
  state: SessionState;
  /** Null in mock mode. */
  api: SahayaApi | null;
  client: ApiClient | null;
  getToken: () => string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: (notice?: string) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

/** Signed-in API helper for screens that only render inside a live session. */
export function useApi(): SahayaApi {
  const { api } = useSession();
  if (!api) throw new Error('useApi requires a signed-in API session');
  return api;
}

export { STAFF_ROLES };

export function hasRole(user: Pick<Me, 'roles'>, ...roles: Role[]): boolean {
  return roles.some((role) => user.roles.includes(role));
}

export function isStaff(user: Pick<Me, 'roles'>): boolean {
  return hasRole(user, ...STAFF_ROLES);
}

export function SessionProvider({
  apiBaseUrl,
  fetchImpl,
  children,
}: {
  apiBaseUrl: string | null;
  fetchImpl?: typeof fetch;
  children: ReactNode;
}) {
  const tokenRef = useRef<string | null>(readStored()?.token ?? null);
  const [state, setState] = useState<SessionState>(() =>
    apiBaseUrl
      ? tokenRef.current
        ? { status: 'checking' }
        : { status: 'signed-out' }
      : { status: 'mock', user: MOCK_USER },
  );

  const signOut = useCallback((notice?: string) => {
    tokenRef.current = null;
    writeStored(null);
    setState(notice ? { status: 'signed-out', notice } : { status: 'signed-out' });
  }, []);

  const client = useMemo(
    () =>
      apiBaseUrl
        ? new ApiClient({
            baseUrl: apiBaseUrl,
            getToken: () => tokenRef.current,
            onUnauthorized: () => {
              if (tokenRef.current) signOut('Your session ended. Sign in again.');
            },
            ...(fetchImpl ? { fetchImpl } : {}),
          })
        : null,
    [apiBaseUrl, fetchImpl, signOut],
  );
  const api = useMemo(() => (client ? sahayaApi(client) : null), [client]);

  // Re-validate a stored session against the server before trusting it.
  useEffect(() => {
    if (!api || state.status !== 'checking') return;
    const stored = readStored();
    if (!stored || stored.expiresAt <= Date.now()) {
      signOut(stored ? 'Your session expired. Sign in again.' : undefined);
      return;
    }
    let active = true;
    api.me().then(
      (user) => {
        if (active)
          setState({
            status: 'signed-in',
            user,
            expiresAt: stored.expiresAt,
            warning: stored.warning,
          });
      },
      (error: unknown) => {
        if (!active) return;
        // Offline at start-up: keep the stored identity; the server still checks every call.
        if (
          error instanceof ApiError &&
          (error.problem === 'OFFLINE' || error.problem === 'NETWORK')
        ) {
          setState({
            status: 'signed-in',
            user: stored.user,
            expiresAt: stored.expiresAt,
            warning: stored.warning,
          });
        } else {
          signOut('Your session could not be confirmed. Sign in again.');
        }
      },
    );
    return () => {
      active = false;
    };
  }, [api, state.status, signOut]);

  // End the session when the server-issued token expires.
  useEffect(() => {
    if (state.status !== 'signed-in') return;
    const remaining = state.expiresAt - Date.now();
    const timer = setTimeout(
      () => signOut('Your session expired. Sign in again.'),
      Math.max(0, remaining),
    );
    return () => clearTimeout(timer);
  }, [state, signOut]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!client) throw new Error('No API configured');
      const result = await client.post<LoginResult>('/api/v1/auth/demo-login', { email, password });
      const expiresAt = Date.now() + result.expiresInSeconds * 1000;
      tokenRef.current = result.accessToken;
      writeStored({
        token: result.accessToken,
        expiresAt,
        user: result.user,
        warning: result.warning,
      });
      setState({ status: 'signed-in', user: result.user, expiresAt, warning: result.warning });
    },
    [client],
  );

  const value = useMemo<SessionContextValue>(
    () => ({ state, api, client, getToken: () => tokenRef.current, signIn, signOut }),
    [state, api, client, signIn, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
