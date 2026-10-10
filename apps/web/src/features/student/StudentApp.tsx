import { useMemo, useState } from 'react';
import { createI18n, I18nContext, loadSavedLanguage, saveLanguage, type Language } from '../../i18n';
import { IndexedDbPackCacheStore, isBrowserOnline, useOnlineStatus, type GroupedCacheStore } from '../../lib/offline';
import { HttpStudentApi } from './api/httpStudentApi';
import { MockStudentApi } from './api/mockStudentApi';
import type { StudentApi } from './api/studentApi';
import { createCheckInQueue, type CheckInQueue } from './checkIn/checkInQueue';
import { useCheckIns } from './checkIn/useCheckIns';
import { CheckInPanel } from './components/CheckInPanel';
import { ConnectionStatus, type ConnectionView } from './components/ConnectionStatus';
import { InstructionPacksView } from './components/InstructionPacksView';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { SafetyHeader } from './components/SafetyHeader';
import { SubmissionHistory } from './components/SubmissionHistory';
import { parseStudentConfig } from './config';
import type { InstructionPackWithContent } from './contracts/provisional';
import { useInstructionPacks } from './instructions/useInstructionPacks';
import './student.css';

export interface StudentDeps {
  api: StudentApi;
  queue: CheckInQueue;
  packStore: GroupedCacheStore<InstructionPackWithContent>;
  now: () => Date;
  usingMockApi: boolean;
  geolocation?: Geolocation;
  initialLanguage?: Language;
}

const systemNow = () => new Date();

export function createStudentDeps(
  env: { VITE_API_BASE_URL?: string } = import.meta.env as { VITE_API_BASE_URL?: string },
): StudentDeps {
  const { apiBaseUrl } = parseStudentConfig(env);
  const api: StudentApi = apiBaseUrl
    ? new HttpStudentApi(apiBaseUrl)
    : new MockStudentApi({ latencyMs: 600 });
  return {
    api,
    queue: createCheckInQueue(api, isBrowserOnline),
    packStore: new IndexedDbPackCacheStore<InstructionPackWithContent>(),
    now: systemNow,
    usingMockApi: apiBaseUrl === null,
  };
}

/** Student safety feature. Self-contained: no router or global providers required. */
export function StudentApp({ deps: providedDeps }: { deps?: StudentDeps }) {
  const [deps] = useState(() => providedDeps ?? createStudentDeps());
  const [language, setLanguage] = useState<Language>(() => deps.initialLanguage ?? loadSavedLanguage());
  const i18n = useMemo(() => createI18n(language, deps.now), [language, deps.now]);
  const online = useOnlineStatus();
  const checkIns = useCheckIns(deps.queue, deps.now);
  const packs = useInstructionPacks(deps.api, deps.packStore, language, deps.now);

  const connection: ConnectionView = !online
    ? 'offline'
    : checkIns.snapshot.entries.some(
          (e) => e.lifecycle === 'QUEUED' && (e.problem === 'TIMEOUT' || e.problem === 'SERVER_UNAVAILABLE'),
        )
      ? 'server-unreachable'
      : 'online';

  const changeLanguage = (next: Language) => {
    setLanguage(next);
    saveLanguage(next);
  };

  return (
    <I18nContext.Provider value={i18n}>
      <div className="sc-student" lang={language}>
        <SafetyHeader usingMockApi={deps.usingMockApi} />
        <main className="sc-main">
          <LanguageSwitcher onChange={changeLanguage} />
          <ConnectionStatus view={connection} />
          <CheckInPanel checkIns={checkIns} geolocation={deps.geolocation} />
          <SubmissionHistory entries={checkIns.snapshot.entries} onRetry={checkIns.retry} />
          <InstructionPacksView view={packs} />
        </main>
      </div>
    </I18nContext.Provider>
  );
}
