import { useEffect, useState } from 'react';
import type { GroupedCacheStore } from '../../../lib/offline';
import type { StudentApi } from '../api/studentApi';
import type { InstructionPackWithContent } from '../contracts/provisional';
import { readCachedPacks, refreshPacks, type PacksView } from './instructionPacks';

/** Shows the device copy immediately, then tries to refresh it from the server. */
export function useInstructionPacks(
  api: StudentApi,
  store: GroupedCacheStore<InstructionPackWithContent>,
  language: string,
  now: () => Date,
): PacksView | null {
  const [view, setView] = useState<PacksView | null>(null);

  useEffect(() => {
    let cancelled = false;
    setView(null);
    void (async () => {
      const cached = await readCachedPacks(store, language, now());
      if (cancelled) return;
      setView({ packs: cached.packs, refresh: 'checking', storageFailed: cached.storageFailed });
      const refreshed = await refreshPacks(api, store, language, cached.packs, now());
      if (cancelled) return;
      setView({ ...refreshed, storageFailed: refreshed.storageFailed || cached.storageFailed });
    })();
    return () => {
      cancelled = true;
    };
  }, [api, store, language, now]);

  return view;
}
