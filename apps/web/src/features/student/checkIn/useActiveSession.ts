import { useCallback, useEffect, useState } from 'react';
import type { RequestProblem } from '../../../lib/offline';
import type { StudentApi } from '../api/studentApi';
import type { CheckInSession } from '../contracts/studentContract';

export type SessionView =
  | { kind: 'loading' }
  | { kind: 'found'; session: CheckInSession; checkedAt: string; fromCache: boolean }
  | { kind: 'none'; checkedAt: string }
  | { kind: 'unknown'; problem: RequestProblem };

const STORAGE_KEY = 'safe-campus.student.lastSession';

interface Cached {
  session: CheckInSession | null;
  checkedAt: string;
}

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    // Unreadable or blocked storage: behave as if nothing is cached.
    return null;
  }
}

function writeCache(value: Cached): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Non-critical: the session is re-fetched next time the app is online.
  }
}

/**
 * The incident or drill check-ins are attached to (required by the contract).
 * The last answer from the server is cached so a student who checks in while
 * offline is still attached to the event they were responding to; the UI shows
 * when that was last checked.
 */
export function useActiveSession(api: StudentApi, now: () => Date) {
  const [view, setView] = useState<SessionView>(() => {
    const cached = readCache();
    if (!cached) return { kind: 'loading' };
    return cached.session
      ? { kind: 'found', session: cached.session, checkedAt: cached.checkedAt, fromCache: true }
      : { kind: 'none', checkedAt: cached.checkedAt };
  });

  const refresh = useCallback(async () => {
    const result = await api.getActiveSession();
    const checkedAt = now().toISOString();
    if (result.kind === 'found') {
      writeCache({ session: result.session, checkedAt });
      setView({ kind: 'found', session: result.session, checkedAt, fromCache: false });
    } else if (result.kind === 'none') {
      writeCache({ session: null, checkedAt });
      setView({ kind: 'none', checkedAt });
    } else {
      // Keep the cached answer if there is one; otherwise say we don't know.
      setView((current) => (current.kind === 'loading' ? { kind: 'unknown', problem: result.problem } : current));
    }
  }, [api, now]);

  useEffect(() => {
    void refresh();
    const onOnline = () => void refresh();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [refresh]);

  const session = view.kind === 'found' ? view.session : null;
  return { view, session, refresh };
}
