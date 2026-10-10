import { useEffect, useState } from 'react';
import { FALLBACK_LANGUAGE } from '../../../i18n';
import type { GroupedCacheStore } from '../../../lib/offline';
import type { StudentApi } from '../api/studentApi';
import type { StudentInstructionPack } from '../contracts/studentContract';
import { readCachedPacks, refreshPacks, type PacksView } from './instructionPacks';

export interface PacksDisplay extends PacksView {
  /** Language of the packs being shown. */
  shownLanguage: string;
  /** Set when nothing exists in the requested language and the approved fallback is shown instead. */
  fallbackFrom: string | null;
}

/**
 * Shows the device copy immediately, then tries to refresh it. If the selected
 * language has no displayable packs, it falls back explicitly to the approved
 * fallback language (English) and says so — it never shows another language silently.
 */
export function useInstructionPacks(
  api: StudentApi,
  store: GroupedCacheStore<StudentInstructionPack>,
  language: string,
  now: () => Date,
): PacksDisplay | null {
  const [view, setView] = useState<PacksDisplay | null>(null);

  useEffect(() => {
    let cancelled = false;
    setView(null);

    const load = async (lang: string, fallbackFrom: string | null): Promise<PacksDisplay | null> => {
      const cached = await readCachedPacks(store, lang, now());
      if (cancelled) return null;
      setView({ packs: cached.packs, refresh: 'checking', storageFailed: cached.storageFailed, shownLanguage: lang, fallbackFrom });
      const refreshed = await refreshPacks(api, store, lang, cached.packs, now());
      if (cancelled) return null;
      return {
        ...refreshed,
        storageFailed: refreshed.storageFailed || cached.storageFailed,
        shownLanguage: lang,
        fallbackFrom,
      };
    };

    void (async () => {
      const primary = await load(language, null);
      if (!primary) return;
      if (primary.packs.length > 0 || language === FALLBACK_LANGUAGE) {
        setView(primary);
        return;
      }
      const fallback = await load(FALLBACK_LANGUAGE, language);
      if (fallback) setView(fallback);
    })();

    return () => {
      cancelled = true;
    };
  }, [api, store, language, now]);

  return view;
}
