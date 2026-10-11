import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  photoUploadStatus,
  sendPhotosForHelpRequest,
  type PhotoUploader,
  type PhotoUploadStatus,
} from '../../features/student/attachments/photoUploads';
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
import type { Me, SahayaApi } from '../api/sahaya';
import { WELCOME_KEY, useSession } from '../auth/session';
import { WelcomeScreen } from './WelcomeScreen';
import { appConfig } from '../config';
import { DrillBanner } from '../DrillBanner';
import { useRoute } from '../router';
import { ROUTES } from '../routes';
import { OfflineIndicator } from '../../design-system';
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
    path: ROUTES.student.home,
    label: 'Home',
    description: 'Check-in status, safety actions and contacts.',
    keywords: ['home', 'check in', 'safe', 'help'],
    roles: ['STUDENT'],
  },
  {
    id: 'student.map',
    path: ROUTES.student.map,
    label: 'Map',
    description: 'Demo campus map and digital twin. Not for navigation.',
    keywords: ['map', 'campus', 'building', 'twin'],
    roles: ['STUDENT'],
  },
  {
    id: 'student.alerts',
    path: ROUTES.student.alerts,
    label: 'Alerts',
    description: 'Alerts sent to you and incidents you reported.',
    keywords: ['alert', 'notification', 'inbox', 'incident'],
    roles: ['STUDENT'],
  },
  {
    id: 'student.prepare',
    path: ROUTES.student.prepare,
    label: 'Prepare',
    description: 'Approved instruction packs and practice drills.',
    keywords: ['prepare', 'drill', 'instructions', 'training', 'guide'],
    roles: ['STUDENT'],
  },
  {
    id: 'student.profile',
    path: ROUTES.student.profile,
    label: 'Profile',
    description: 'Your details, trusted contacts, history and settings.',
    keywords: ['profile', 'settings', 'contacts', 'language', 'logout'],
    roles: ['STUDENT'],
  },
  {
    id: 'student.report',
    path: ROUTES.student.report,
    label: 'Report incident',
    description: 'Report something you see. Reports are unverified until reviewed.',
    keywords: ['report', 'incident', 'hazard'],
    roles: ['STUDENT'],
  },
  {
    id: 'student.sos',
    path: ROUTES.student.sos,
    label: 'Emergency SOS',
    description: 'Emergency screen: call 112 and send a help request.',
    keywords: ['sos', 'emergency', '112'],
    roles: ['STUDENT'],
  },
];

/**
 * Photos kept on the device per check-in, and their upload progress. With an
 * API session, photos of a help request the server has received are uploaded
 * and linked to it; this runs again when the connection comes back.
 */
function usePhotos(
  deps: StudentDeps,
  entries: readonly CheckInEntry[],
  api: SahayaApi | null,
  online: boolean,
) {
  const [byKey, setByKey] = useState<Map<string, StoredPhoto[]>>(new Map());
  const running = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    try {
      const next = new Map<string, StoredPhoto[]>();
      for (const photo of await deps.photoStore.getAll()) {
        if (!photo.checkInKey) continue;
        next.set(photo.checkInKey, [...(next.get(photo.checkInKey) ?? []), photo]);
      }
      setByKey(next);
    } catch {
      setByKey(new Map());
    }
  }, [deps]);

  useEffect(() => {
    void refresh();
  }, [refresh, entries]);

  useEffect(() => {
    if (!api || !online) return;
    const uploader: PhotoUploader = {
      upload: (bytes, mediaType) => api.uploadPhoto(bytes, mediaType),
      link: async (helpRequestId, ids) => {
        await api.linkHelpRequestPhotos(helpRequestId, ids);
      },
    };
    for (const entry of entries) {
      const helpId = entry.lifecycle === 'ACCEPTED' ? entry.result?.helpRequest?.id : undefined;
      const photos = byKey.get(entry.key) ?? [];
      if (!helpId || photos.length === 0 || running.current.has(entry.key)) continue;
      if (photos.every((p) => p.uploadState === 'LINKED')) continue;
      running.current.add(entry.key);
      void sendPhotosForHelpRequest(deps.photoStore, uploader, entry.key, helpId)
        .catch(() => undefined)
        .finally(() => {
          running.current.delete(entry.key);
          void refresh();
        });
    }
  }, [api, online, entries, byKey, deps, refresh]);

  return {
    count: (key: string) => byKey.get(key)?.length ?? 0,
    status: (key: string): PhotoUploadStatus | null =>
      api ? photoUploadStatus(byKey.get(key) ?? []) : null,
    refresh,
  };
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
  const photos = usePhotos(deps, entries, api, online);
  const [helpOpen, setHelpOpen] = useState(false);
  const [welcome, setWelcome] = useState(() => {
    try {
      return localStorage.getItem(WELCOME_KEY) === user.id;
    } catch {
      return false;
    }
  });
  const finishWelcome = useCallback(() => {
    try {
      localStorage.removeItem(WELCOME_KEY);
    } catch {
      // Nothing stored.
    }
    setWelcome(false);
  }, []);
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
    photoStatus: photos.status,
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

  // Paths look like /student/<tab>; the App gate only renders this shell under /student.
  const route = path.split('/').filter(Boolean)[1] ?? 'home';
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
          {welcome && route !== 'sos' ? (
            <WelcomeScreen name={user.displayName} onContinue={finishWelcome} />
          ) : route === 'sos' ? (
            <SosScreen onClose={() => navigate(ROUTES.student.home)} />
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
                <OfflineIndicator
                  online={connection !== 'offline'}
                  serverUnreachable={connection === 'server-unreachable'}
                />
              </header>
              <ModeBanner mode={mock ? 'MOCK' : user.mode} />
              <DrillBanner api={api} />
              <main className="as-main" id="as-main">
                {screen}
              </main>
              <button
                type="button"
                className="as-sos-fab"
                onClick={() => navigate(ROUTES.student.sos)}
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
                      onClick={() => navigate(`${ROUTES.student.root}/${t.id}`)}
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
              photosUploadable={!mock}
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
