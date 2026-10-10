import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createI18n, getLocale, I18nContext, loadSavedLanguage, saveLanguage, type Language } from '../../i18n';
import {
  IndexedDbAttachmentStore,
  IndexedDbPackCacheStore,
  isBrowserOnline,
  requestPersistentStorage,
  useOfflineReady,
  useOnlineStatus,
  useUpdateReady,
  type GroupedCacheStore,
  type RecordStore,
  type StorageHeadroom,
} from '../../lib/offline';
import { HttpStudentApi } from './api/httpStudentApi';
import { MockStudentApi } from './api/mockStudentApi';
import type { StudentApi } from './api/studentApi';
import { CanvasImageProcessor, type ImageProcessor } from './attachments/imageProcessor';
import { deletePhotosForCheckIn, type StoredPhoto } from './attachments/useAttachments';
import { createCheckInQueue, type CheckInEntry, type CheckInQueue } from './checkIn/checkInQueue';
import { useActiveSession } from './checkIn/useActiveSession';
import { useCheckIns, type NewCheckIn } from './checkIn/useCheckIns';
import { AboutNotes } from './components/AboutNotes';
import { AppBar } from './components/AppBar';
import { BottomNav, type Screen } from './components/BottomNav';
import { CampusContacts } from './components/CampusContacts';
import type { ConnectionView } from './components/ConnectionStatus';
import { EmergencyCard } from './components/EmergencyCard';
import { HelpSheet } from './components/HelpSheet';
import { HomeScreen } from './components/HomeScreen';
import { InstructionPacksView } from './components/InstructionPacksView';
import { RecentActivity } from './components/RecentActivity';
import { SubmissionCard } from './components/SubmissionCard';
import { SyncStatus } from './components/SyncStatus';
import { parseStudentConfig } from './config';
import type { StudentInstructionPack } from './contracts/studentContract';
import { useInstructionPacks } from './instructions/useInstructionPacks';
import type { LocationEnvironment } from './location/useLocationCapture';
import './fonts';
import './student.css';

export interface StudentDeps {
  api: StudentApi;
  queue: CheckInQueue;
  packStore: GroupedCacheStore<StudentInstructionPack>;
  photoStore: RecordStore<StoredPhoto>;
  imageProcessor: ImageProcessor;
  headroom?: () => Promise<StorageHeadroom>;
  now: () => Date;
  usingMockApi: boolean;
  locationEnv?: LocationEnvironment;
  makePreviewUrl?: (photo: StoredPhoto) => string;
  initialLanguage?: Language;
  /** Test hook; defaults to the browser's StorageManager. */
  persistStorage?: () => Promise<'granted' | 'denied' | 'unsupported'>;
}

const systemNow = () => new Date();

export function createStudentDeps(
  env: { VITE_API_BASE_URL?: string } = import.meta.env as { VITE_API_BASE_URL?: string },
): StudentDeps {
  const { apiBaseUrl } = parseStudentConfig(env);
  const api: StudentApi = apiBaseUrl ? new HttpStudentApi(apiBaseUrl) : new MockStudentApi({ latencyMs: 600 });
  return {
    api,
    queue: createCheckInQueue(api, isBrowserOnline),
    packStore: new IndexedDbPackCacheStore<StudentInstructionPack>(),
    photoStore: new IndexedDbAttachmentStore<StoredPhoto>(),
    imageProcessor: new CanvasImageProcessor(),
    now: systemNow,
    usingMockApi: apiBaseUrl === null,
  };
}

/** Counts photos kept on the device per check-in key. */
function usePhotoCounts(store: RecordStore<StoredPhoto>, entries: readonly CheckInEntry[]) {
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const refresh = useCallback(async () => {
    try {
      const all = await store.getAll();
      const next = new Map<string, number>();
      for (const photo of all) if (photo.checkInKey) next.set(photo.checkInKey, (next.get(photo.checkInKey) ?? 0) + 1);
      setCounts(next);
    } catch {
      // Unreadable store: show no counts rather than wrong ones.
      setCounts(new Map());
    }
  }, [store]);
  useEffect(() => {
    void refresh();
  }, [refresh, entries]);
  return { count: (key: string) => counts.get(key) ?? 0, refresh };
}

/** Amrita Sahaya student app. Self-contained: no router or global providers required. */
export function StudentApp({ deps: providedDeps }: { deps?: StudentDeps }) {
  const [deps] = useState(() => providedDeps ?? createStudentDeps());
  const [language, setLanguage] = useState<Language>(() => deps.initialLanguage ?? loadSavedLanguage());
  const [screen, setScreen] = useState<Screen>('home');
  const [helpOpen, setHelpOpen] = useState(false);
  const [repeatOf, setRepeatOf] = useState<CheckInEntry | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const persistAsked = useRef(false);
  const latestRef = useRef<HTMLElement>(null);
  const helpButtonFocus = useRef(false);

  const i18n = useMemo(() => createI18n(language, deps.now), [language, deps.now]);
  const online = useOnlineStatus();
  const offlineReady = useOfflineReady();
  const updateReady = useUpdateReady();
  const { view: sessionView, session } = useActiveSession(deps.api, deps.now);
  const checkIns = useCheckIns(deps.queue, session, deps.now);
  const packs = useInstructionPacks(deps.api, deps.packStore, language, deps.now);
  const entries = checkIns.snapshot.entries;
  const photos = usePhotoCounts(deps.photoStore, entries);

  const waiting = entries.filter((e) => e.lifecycle === 'QUEUED' || e.lifecycle === 'SENDING').length;
  const connection: ConnectionView = !online
    ? 'offline'
    : entries.some((e) => e.lifecycle === 'QUEUED' && (e.problem === 'TIMEOUT' || e.problem === 'SERVER_UNAVAILABLE'))
      ? 'server-unreachable'
      : 'online';

  // Report (without prompting) whether storage is already persistent.
  useEffect(() => {
    void globalThis.navigator?.storage?.persisted?.().then(setPersisted, () => undefined);
  }, []);

  const send = async (checkIn: NewCheckIn): Promise<string | null> => {
    const result = await checkIns.submit(checkIn);
    if (!result) return null;
    setRepeatOf(result.kind === 'repeat-ignored' ? result.entry : null);
    setHelpOpen(false);
    setScreen('home');
    if (result.kind === 'queued' && !persistAsked.current) {
      persistAsked.current = true;
      void (deps.persistStorage ?? (() => requestPersistentStorage()))().then((r) => {
        if (r !== 'unsupported') setPersisted(r === 'granted');
      });
    }
    // Move focus to the result so keyboard and screen-reader users hear the outcome.
    requestAnimationFrame(() => latestRef.current?.focus());
    return result.kind === 'queued' ? result.entry.key : null;
  };

  const changeLanguage = (next: Language) => {
    setLanguage(next);
    saveLanguage(next);
  };

  const deletePhotos = async (key: string) => {
    await deletePhotosForCheckIn(deps.photoStore, key).catch(() => undefined);
    await photos.refresh();
  };

  const latest = entries[0];

  return (
    <I18nContext.Provider value={i18n}>
      <div className="sc-student" lang={language} data-script={getLocale(language).script}>
        <div className="sc-app" inert={helpOpen || undefined}>
          <AppBar connection={connection} onLanguageChange={changeLanguage} updateReady={updateReady} />

          <main className="sc-main" id="sc-main">
            {screen === 'home' && (
              <HomeScreen
                ref={latestRef}
                ready={checkIns.snapshot.ready}
                submitting={checkIns.submitting}
                session={sessionView}
                latest={latest}
                repeatOf={repeatOf}
                storageFailed={checkIns.snapshot.storageFailed}
                onSafe={() => void send({ status: 'CONFIRMED_SAFE' })}
                onHelp={() => {
                  setRepeatOf(null);
                  helpButtonFocus.current = true;
                  setHelpOpen(true);
                }}
                onRetry={checkIns.retry}
                photoCount={photos.count}
                onDeletePhotos={(key) => void deletePhotos(key)}
              />
            )}

            {screen === 'guides' && (
              <div className="sc-screen">
                <InstructionPacksView view={packs} />
                <CampusContacts />
                <EmergencyCard />
              </div>
            )}

            {screen === 'activity' && (
              <div className="sc-screen">
                <SyncStatus connection={connection} entries={entries} offlineReady={offlineReady} storagePersisted={persisted} />
                {latest && (
                  <section className="sc-section" aria-labelledby="sc-activity-latest">
                    <h2 id="sc-activity-latest" className="sc-h2">
                      {i18n.t.latestHeading}
                    </h2>
                    <SubmissionCard
                      entry={latest}
                      onRetry={checkIns.retry}
                      photoCount={photos.count(latest.key)}
                      onDeletePhotos={(key) => void deletePhotos(key)}
                    />
                  </section>
                )}
                <RecentActivity entries={entries} onRetry={checkIns.retry} />
                <AboutNotes usingMockApi={deps.usingMockApi} />
              </div>
            )}
          </main>

          <BottomNav current={screen} onChange={setScreen} badge={waiting} />
        </div>

        {helpOpen && (
          <HelpSheet
            onSend={send}
            onClose={() => {
              setHelpOpen(false);
              helpButtonFocus.current = false;
            }}
            sending={checkIns.submitting}
            attachmentDeps={{
              store: deps.photoStore,
              processor: deps.imageProcessor,
              ...(deps.headroom ? { headroom: deps.headroom } : {}),
              ...(deps.makePreviewUrl ? { makePreviewUrl: deps.makePreviewUrl } : {}),
              now: deps.now,
            }}
            locationEnv={deps.locationEnv}
            now={deps.now}
          />
        )}
      </div>
    </I18nContext.Provider>
  );
}
