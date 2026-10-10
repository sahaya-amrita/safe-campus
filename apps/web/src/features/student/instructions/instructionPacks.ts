import type { CachedRecord, GroupedCacheStore, RequestProblem } from '../../../lib/offline';
import type { StudentApi } from '../api/studentApi';
import {
  DEMO_SAMPLE_APPROVAL_STATE,
  OFFICIAL_APPROVAL_STATES,
  type InstructionPackWithContent,
} from '../contracts/provisional';

export type PackKind = 'OFFICIAL' | 'DEMO_SAMPLE';

/** A cached copy older than this is flagged as possibly out of date. */
export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Only approved/published packs are official. Demo samples may be shown but
 * always labelled as samples. Anything else (draft, rejected, unknown) is
 * neither cached nor displayed.
 */
export function classifyPack(pack: Pick<InstructionPackWithContent, 'approvalState'>): PackKind | null {
  if (OFFICIAL_APPROVAL_STATES.has(pack.approvalState)) return 'OFFICIAL';
  if (pack.approvalState === DEMO_SAMPLE_APPROVAL_STATE) return 'DEMO_SAMPLE';
  return null;
}

export interface DisplayPack {
  pack: InstructionPackWithContent;
  kind: PackKind;
  fetchedAt: string;
  expired: boolean;
  stale: boolean;
}

export type RefreshStatus = 'checking' | 'fresh' | RequestProblem;

export interface PacksView {
  packs: DisplayPack[];
  refresh: RefreshStatus;
  storageFailed: boolean;
}

export function toDisplayPacks(records: CachedRecord<InstructionPackWithContent>[], now: Date): DisplayPack[] {
  return records
    .flatMap((record) => {
      const kind = classifyPack(record.pack);
      if (!kind || !Array.isArray(record.pack.sections)) return [];
      const expiresAt = record.pack.expiresAt ? Date.parse(record.pack.expiresAt) : Number.NaN;
      return [
        {
          pack: record.pack,
          kind,
          fetchedAt: record.fetchedAt,
          expired: Number.isFinite(expiresAt) && expiresAt <= now.getTime(),
          stale: now.getTime() - Date.parse(record.fetchedAt) > STALE_AFTER_MS,
        },
      ];
    })
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'OFFICIAL' ? -1 : 1));
}

/** Reads the device copy for `language`. Never throws. */
export async function readCachedPacks(
  store: GroupedCacheStore<InstructionPackWithContent>,
  language: string,
  now: Date,
): Promise<{ packs: DisplayPack[]; storageFailed: boolean }> {
  try {
    return { packs: toDisplayPacks(await store.load(language), now), storageFailed: false };
  } catch {
    // Unreadable cache is reported to the UI, not hidden.
    return { packs: [], storageFailed: true };
  }
}

/**
 * Fetches fresh packs and replaces the device copy, keeping only displayable
 * packs. On any failure the cached copy is kept and the reason returned.
 */
export async function refreshPacks(
  api: StudentApi,
  store: GroupedCacheStore<InstructionPackWithContent>,
  language: string,
  cached: DisplayPack[],
  now: Date,
): Promise<PacksView> {
  const result = await api.listInstructionPacks(language);
  if (result.kind === 'error') return { packs: cached, refresh: result.problem, storageFailed: false };

  const fetchedAt = now.toISOString();
  const records: CachedRecord<InstructionPackWithContent>[] = result.packs
    .filter((pack) => pack.language === language && classifyPack(pack) !== null)
    .map((pack) => ({ pack, group: language, fetchedAt }));
  let storageFailed = false;
  try {
    await store.replaceGroup(language, records);
  } catch {
    storageFailed = true;
  }
  return { packs: toDisplayPacks(records, now), refresh: 'fresh', storageFailed };
}
