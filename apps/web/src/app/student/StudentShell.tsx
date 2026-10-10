import { useCallback, useEffect, useMemo, useState } from 'react';
import { BRAND } from '../../brand';
import {
  createI18n,
  getLocale,
  I18nContext,
  loadSavedLanguage,
  saveLanguage,
  type Language,
} from '../../i18n';
import {
  IndexedDbAttachmentStore,
  IndexedDbPackCacheStore,
  IndexedDbQueueStore,
  isBrowserOnline,
  requestPersistentStorage,
  useOfflineReady,
  useOnlineStatus,
} from '../../lib/offline';
import type { StudentDeps } from '../../features/student';
import { HttpStudentApi } from '../../features/student/api/httpStudentApi';
import { MockStudentApi } from '../../features/student/api/mockStudentApi';
import { CanvasImageProcessor } from '../../features/student/attachments/imageProcessor';
import {
  deletePhotosForCheckIn,
  type StoredPhoto,
} from '../../features/student/attachments/useAttachments';
import { createCheckInQueue, type CheckInEntry } from '../../features/student/checkIn/checkInQueue';
import { useActiveSession } from '../../features/student/checkIn/useActiveSession';
import { useCheckIns, type NewCheckIn } from '../../features/student/checkIn/useCheckIns';
import { HelpSheet } from '../../features/student/components/HelpSheet';
import type { ConnectionView } from '../../features/student/components/ConnectionStatus';
import type {
  CheckInSession,
  StudentInstructionPack,
} from '../../features/student/contracts/studentContract';
import '../../features/student/fonts';
import '../../features/student/student.css';
import type { Me } from '../api/sahaya';
import { useSession } from '../auth/session';
import { appConfig } from '../config';
import { DrillBanner } from '../DrillBanner';
import { useRoute } from '../router';
import { TomHost, type AppDestination } from '../TomHost';
import { AppIcon, ModeBanner, useAsync, type AppIconName } from '../ui';
import {
  OwnerScopedQueueStore,
  StudentCoreContext,
  readPreferredSession,
  usePrefs,
  writePreferredSession,
  type CheckInDraft,
  type CheckInReceipt,
  type StudentCore,
} from './core';
import { AlertsScreen } from './AlertsScreen';
import { StudentHome } from './StudentHome';
import { MapScreen } from './MapScreen';
import { PrepareScreen } from './PrepareScreen';
import { ProfileScreen } from './ProfileScreen';
import { ReportIncidentScreen } from './ReportIncidentScreen';
import { SosScreen } from './SosScreen';

type Tab = 'home' | 'map' | 'alerts' | 'prepare' | 'profile';

const TABS: { id: Tab; icon: AppIconName; en: string; ta: string }[] = [
  { id: 'home', icon: 'home', en: 'Home', ta: 'முகப்பு' },
  { id: 'map', icon: 'map', en: 'Map', ta: 'வரைபடம்' },
  { id: 'alerts', icon: 'bell', en: 'Alerts', ta: 'எச்சரிக்கைகள்' },
  { id: 'prepare', icon: 'book', en: 'Prepare', ta: 'தயார்நிலை' },
  { id: 'profile', icon: 'user', en: 'Profile', ta: 'சுயவிவரம்' },
];

export const STUDENT_DESTINATIONS: AppDestination[] = [
  {
    id: 'student.home',
    path: '/home',
    label: 'Home',
    description: 'Check-in status, safety actions and contacts.',
    keywords: ['home', 'check in', 'safe', 'help'],
    roles: ['STUDENT'],
  },
  {
    id: 'student.map',
    path: '/map',
    label: 'Map',
    description: 'Demo campus map and digital twin. Not for navigation.',
    keywords: ['map', 'campus', 'building', 'twin'],
    roles: ['STUDENT'],
  },
  {
    id: 'student.alerts',
    path: '/alerts',
    label: 'Alerts',
    description: 'Alerts sent to you and incidents you reported.',
    keywords: ['alert', 'notification', 'inbox', 'incident'],
    roles: ['STUDENT'],
  },
  {
    id: 'student.prepare',
    path: '/prepare',
    label: 'Prepare',
    description: 'Approved instruction packs and practice drills.',
    keywords: ['prepare', 'drill', 'instructions', 'training', 'guide'],
    roles: ['STUDENT'],
  },
  {
    id: 'student.profile',
    path: '/profile',
    label: 'Profile',
    description: 'Your details, trusted contacts, history and settings.',
    keywords: ['profile', 'settings', 'contacts', 'language', 'logout'],
    roles: ['STUDENT'],
  },
  {
    id: 'student.report',
    path: '/report',
    label: 'Report incident',
    description: 'Report something you see. Reports are unverified until reviewed.',
    keywords: ['report', 'incident', 'hazard'],
    roles: ['STUDENT'],
  },
  {
    id: 'student.sos',
    path: '/sos',
    label: 'Emergency SOS',
    description: 'Emergency screen: call 112 and send a help request.',
    keywords: ['sos', 'emergency', '112'],
    roles: ['STUDENT'],
  },
];

/** Counts photos kept on the device per check-in key. */
function usePhotoCounts(deps: StudentDeps, entries: readonly CheckInEntry[]) {
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const refresh = useCallback(async () => {
    try {
      const all = await deps.photoStore.getAll();
      const next = new Map<string, number>();
      for (const photo of all)
        if (photo.checkInKey) next.set(photo.checkInKey, (next.get(photo.checkInKey) ?? 0) + 1);
      setCounts(next);
    } catch {
      setCounts(new Map());
    }
  }, [deps]);
  useEffect(() => {
    void refresh();
  }, [refresh, entries]);
  return { count: (key: string) => counts.get(key) ?? 0, refresh };
}

export function StudentShell({ user }: { user: Me }) {
  const { api, getToken, signOut, state } = useSession();
  const mock = state.status === 'mock' || !api;
  const { path, navigate } = useRoute();
  const [preferredSession, setPreferredSession] = useState(() => readPreferredSession(user.id));

  const [deps] = useState<StudentDeps>(() => {
    const studentApi =
      mock || !appConfig.apiBaseUrl
        ? new MockStudentApi({ latencyMs: 600 })
        : new HttpStudentApi(appConfig.apiBaseUrl, undefined, undefined, undefined, {
            getAccessToken: getToken,
            preferredSessionId: () => readPreferredSession(user.id),
          });
    return {
      api: studentApi,
      queue: createCheckInQueue(
        studentApi,
        isBrowserOnline,
        new OwnerScopedQueueStore<CheckInDraft, CheckInReceipt>(new IndexedDbQueueStore(), user.id),
      ),
      packStore: new IndexedDbPackCacheStore<StudentInstructionPack>(),
      photoStore: new IndexedDbAttachmentStore<StoredPhoto>(),
      imageProcessor: new CanvasImageProcessor(),
      now: () => new Date(),
      usingMockApi: mock,
    };
  });

  const [language, setLanguageState] = useState<Language>(() => loadSavedLanguage());
  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    saveLanguage(next);
  }, []);
  const i18n = useMemo(() => createI18n(language, deps.now), [language, deps.now]);
  const [prefs, setPrefs] = usePrefs();

  const online = useOnlineStatus();
  const offlineReady = useOfflineReady();
  const {
    view: sessionView,
    session,
    refresh: refreshSession,
  } = useActiveSession(deps.api, deps.now);
  const checkIns = useCheckIns(deps.queue, session, deps.now);
  const entries = checkIns.snapshot.entries;
  const photos = usePhotoCounts(deps, entries);
  const [helpOpen, setHelpOpen] = useState(false);
  const [repeatOf, setRepeatOf] = useState<CheckInEntry | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  // Server data shared by several tabs. Polling pauses offline / in background tabs.
  const inbox = useAsync(api ? () => api.alertInbox() : null, [api], 20_000);
  const incidents = useAsync(api ? () => api.listIncidents(25) : null, [api], 30_000);
  const myHelp = useAsync(api ? () => api.myHelpRequests() : null, [api], 15_000);

  const sessionsState = useAsync<CheckInSession[]>(
    deps.api instanceof HttpStudentApi
      ? async () => {
          const listed = await (deps.api as HttpStudentApi).listSessions();
          if (listed.kind === 'error') throw new Error(listed.problem);
          return listed.sessions;
        }
      : null,
    [deps.api, inbox.at?.getTime(), incidents.at?.getTime()],
  );

  const chooseSession = useCallback(
    (id: string) => {
      writePreferredSession(user.id, id);
      setPreferredSession(id);
    },
    [user.id],
  );
  useEffect(() => {
    void refreshSession();
  }, [preferredSession, sessionsState.data, refreshSession]);

  useEffect(() => {
    void globalThis.navigator?.storage?.persisted?.().then(setPersisted, () => undefined);
  }, []);

  const send = useCallback(
    async (checkIn: NewCheckIn): Promise<string | null> => {
      const result = await checkIns.submit(checkIn);
      if (!result) return null;
      setRepeatOf(result.kind === 'repeat-ignored' ? result.entry : null);
      setHelpOpen(false);
      if (result.kind === 'queued') {
        void requestPersistentStorage().then((r) => {
          if (r !== 'unsupported') setPersisted(r === 'granted');
        });
      }
      // The server's help-request lifecycle is shown once the queue reports SERVER_RECEIVED.
      setTimeout(() => myHelp.reload(), 1500);
      return result.kind === 'queued' ? result.entry.key : null;
    },
    [checkIns, myHelp],
  );

  const connection: ConnectionView = !online
    ? 'offline'
    : entries.some(
          (e) =>
            e.lifecycle === 'QUEUED' &&
            (e.problem === 'TIMEOUT' || e.problem === 'SERVER_UNAVAILABLE'),
        )
      ? 'server-unreachable'
      : 'online';

  const core: StudentCore = {
    user,
    mock,
    api,
    deps,
    i18n,
    language,
    setLanguage,
    sessionView,
    session,
    sessions: sessionsState.data ?? null,
    chooseSession,
    refreshSessions: sessionsState.reload,
    checkIns,
    entries,
    send,
    openHelp: () => {
      setRepeatOf(null);
      setHelpOpen(true);
    },
    repeatOf,
    connection,
    online,
    offlineReady,
    persisted,
    photoCount: photos.count,
    deletePhotos: (key) =>
      void deletePhotosForCheckIn(deps.photoStore, key)
        .catch(() => undefined)
        .then(() => photos.refresh()),
    inbox: api ? inbox : null,
    incidents: api ? incidents : null,
    myHelp: api ? myHelp : null,
    prefs,
    setPrefs,
  };

  const route = path.split('/').filter(Boolean)[0] ?? 'home';
  const tab: Tab = (TABS.some((t) => t.id === route) ? route : 'home') as Tab;
  const unacknowledged = inbox.data?.items.filter((a) => !a.acknowledgedAt).length ?? 0;
  const waiting = entries.filter(
    (e) => e.lifecycle === 'QUEUED' || e.lifecycle === 'SENDING',
  ).length;
  const tamil = language === 'ta';

  let screen;
  if (route === 'sos') screen = null;
  else if (route === 'report') screen = <ReportIncidentScreen />;
  else if (tab === 'map') screen = <MapScreen />;
  else if (tab === 'alerts') screen = <AlertsScreen />;
  else if (tab === 'prepare') screen = <PrepareScreen />;
  else if (tab === 'profile') screen = <ProfileScreen onSignOut={() => signOut()} />;
  else screen = <StudentHome />;

  return (
    <StudentCoreContext.Provider value={core}>
      <I18nContext.Provider value={i18n}>
        <div
          className="sc-student as-student-root"
          lang={language}
          data-script={getLocale(language).script}
        >
          {route === 'sos' ? (
            <SosScreen onClose={() => navigate('/home')} />
          ) : (
            <div className="as-student" inert={helpOpen || undefined}>
              <a className="as-skip" href="#as-main">
                Skip to content
              </a>
              <header className="as-topbar">
                <div className="as-brand">
                  <span className="as-topbar__emblem">
                    <img src={BRAND.emblemUrl} alt="" width={24} height={28} />
                  </span>
                  <div>
                    <p className="as-brand__name">{BRAND.name}</p>
                    <p className="as-brand__tag">Campus safety companion</p>
                  </div>
                </div>
                <span className="as-topbar__status" role="status">
                  <AppIcon name="wifi" size={14} />
                  {connection === 'online'
                    ? 'Online'
                    : connection === 'offline'
                      ? 'Offline'
                      : 'Server unreachable'}
                </span>
              </header>
              <ModeBanner mode={mock ? 'MOCK' : user.mode} />
              <DrillBanner api={api} />
              <main className="as-main" id="as-main">
                {screen}
              </main>
              <button
                type="button"
                className="as-sos-fab"
                onClick={() => navigate('/sos')}
                aria-label="Open emergency SOS screen"
              >
                <AppIcon name="alert" size={20} /> SOS
              </button>
              <nav className="as-tabbar" aria-label="Main">
                {TABS.map((t) => {
                  const badge = t.id === 'alerts' ? unacknowledged : t.id === 'home' ? waiting : 0;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className="as-tab"
                      aria-current={tab === t.id && route !== 'report' ? 'page' : undefined}
                      onClick={() => navigate(`/${t.id}`)}
                    >
                      <AppIcon name={t.icon} size={22} />
                      <span lang={tamil ? 'ta' : 'en'}>{tamil ? t.ta : t.en}</span>
                      {badge > 0 && (
                        <span className="as-tab__badge" aria-label={`${badge} pending`}>
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          )}

          {helpOpen && (
            <HelpSheet
              onSend={send}
              onClose={() => setHelpOpen(false)}
              sending={checkIns.submitting}
              attachmentDeps={{
                store: deps.photoStore,
                processor: deps.imageProcessor,
                now: deps.now,
              }}
              now={deps.now}
            />
          )}
          {!mock && route !== 'sos' && (
            <TomHost
              user={user}
              destinations={STUDENT_DESTINATIONS}
              currentPath={path}
              locale={tamil ? 'ta' : 'en'}
              onboarding={false}
            />
          )}
        </div>
      </I18nContext.Provider>
    </StudentCoreContext.Provider>
  );
}
