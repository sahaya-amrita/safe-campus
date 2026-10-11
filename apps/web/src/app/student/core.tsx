import type { PhotoUploadStatus } from '../../features/student/attachments/photoUploads';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { createI18n, Language } from '../../i18n';
import type { QueueEntry, QueueStore } from '../../lib/offline';
import type {
  CheckInDraft,
  CheckInReceipt,
  CheckInSession,
} from '../../features/student/contracts/studentContract';
import type { InboxAlert, Incident, Me, MyHelpRequest, Page, SahayaApi } from '../api/sahaya';
import type { AsyncState } from '../ui';
import type { StudentDeps } from '../../features/student';
import type { UseCheckIns, NewCheckIn } from '../../features/student/checkIn/useCheckIns';
import type { SessionView } from '../../features/student/checkIn/useActiveSession';
import type { ConnectionView } from '../../features/student/components/ConnectionStatus';
import type { CheckInEntry } from '../../features/student/checkIn/checkInQueue';

/**
 * Keeps each signed-in user's offline check-ins apart on a shared device:
 * entries are tagged with the owner's id and only that owner's entries are
 * loaded (and therefore sent with that owner's token).
 */
export class OwnerScopedQueueStore<P, R> implements QueueStore<P, R> {
  constructor(
    private readonly inner: QueueStore<P, R>,
    private readonly ownerId: string,
  ) {}

  async loadAll(): Promise<QueueEntry<P, R>[]> {
    const rows = await this.inner.loadAll();
    return rows.filter(
      (row) => (row as QueueEntry<P, R> & { ownerId?: string }).ownerId === this.ownerId,
    );
  }

  put(entry: QueueEntry<P, R>): Promise<void> {
    return this.inner.put({ ...entry, ownerId: this.ownerId } as QueueEntry<P, R>);
  }
}

const PREFERRED_SESSION_KEY = 'sahaya.student.preferredSession';

export function readPreferredSession(ownerId: string): string | null {
  try {
    const raw = localStorage.getItem(PREFERRED_SESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as { ownerId: string; id: string }) : null;
    return parsed?.ownerId === ownerId ? parsed.id : null;
  } catch {
    return null;
  }
}

export function writePreferredSession(ownerId: string, id: string): void {
  try {
    localStorage.setItem(PREFERRED_SESSION_KEY, JSON.stringify({ ownerId, id }));
  } catch {
    // Preference only; the newest event is used when it cannot be saved.
  }
}

export interface DisplayPrefs {
  text: 'normal' | 'large';
  contrast: 'normal' | 'high';
  motion: 'system' | 'reduce';
}

const PREFS_KEY = 'sahaya.display';
export const DEFAULT_PREFS: DisplayPrefs = { text: 'normal', contrast: 'normal', motion: 'system' };

export function usePrefs(): [DisplayPrefs, (next: DisplayPrefs) => void] {
  const [prefs, setPrefs] = useState<DisplayPrefs>(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      return raw
        ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<DisplayPrefs>) }
        : DEFAULT_PREFS;
    } catch {
      return DEFAULT_PREFS;
    }
  });
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.as-root');
    if (!root) return;
    root.dataset.text = prefs.text;
    root.dataset.contrast = prefs.contrast;
    root.dataset.motion = prefs.motion;
  }, [prefs]);
  const update = useCallback((next: DisplayPrefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      // Applies for this visit only.
    }
  }, []);
  return [prefs, update];
}

export interface StudentCore {
  user: Me;
  /** True when no API is configured: everything is the labelled mock adapter. */
  mock: boolean;
  api: SahayaApi | null;
  deps: StudentDeps;
  i18n: ReturnType<typeof createI18n>;
  language: Language;
  setLanguage: (language: Language) => void;
  sessionView: SessionView;
  session: CheckInSession | null;
  sessions: CheckInSession[] | null;
  chooseSession: (id: string) => void;
  refreshSessions: () => void;
  checkIns: UseCheckIns;
  entries: readonly CheckInEntry[];
  send: (checkIn: NewCheckIn) => Promise<string | null>;
  openHelp: () => void;
  repeatOf: CheckInEntry | null;
  connection: ConnectionView;
  online: boolean;
  offlineReady: boolean;
  persisted: boolean | null;
  photoCount: (key: string) => number;
  /** Upload progress per check-in; null when photos cannot be sent (no API). */
  photoStatus: (key: string) => PhotoUploadStatus | null;
  deletePhotos: (key: string) => void;
  inbox: AsyncState<Page<InboxAlert>> | null;
  incidents: AsyncState<Page<Incident>> | null;
  myHelp: AsyncState<Page<MyHelpRequest>> | null;
  prefs: DisplayPrefs;
  setPrefs: (next: DisplayPrefs) => void;
}

export const StudentCoreContext = createContext<StudentCore | null>(null);

export function useStudent(): StudentCore {
  const value = useContext(StudentCoreContext);
  if (!value) throw new Error('useStudent must be used inside the student shell');
  return value;
}

/** Latest-value ref helper for callbacks handed to long-lived adapters. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function useMemoOnce<T>(factory: () => T): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- created once per mount by design
  return useMemo(factory, []);
}

export type { CheckInDraft, CheckInReceipt };
