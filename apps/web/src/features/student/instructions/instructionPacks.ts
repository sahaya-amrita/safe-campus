import type { CachedRecord, GroupedCacheStore, RequestProblem } from '../../../lib/offline';
import type { StudentApi } from '../api/studentApi';
import type { StudentInstructionPack } from '../contracts/studentContract';

export type PackKind = 'OFFICIAL' | 'DEMO_SAMPLE';

/** A cached copy older than this is flagged as possibly out of date. */
export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Students may only treat `PUBLISHED` packs as official (API_CONTRACT_RECONCILIATION:
 * "student-facing instruction access returns only PUBLISHED, unexpired packs").
 * Mock samples carry `demoSample` and are always labelled as samples.
 * Anything else is neither cached nor displayed.
 */
export function classifyPack(pack: Pick<StudentInstructionPack, 'approvalState' | 'demoSample'>): PackKind | null {
  if (pack.demoSample) return 'DEMO_SAMPLE';
  if (pack.approvalState === 'PUBLISHED') return 'OFFICIAL';
  return null;
}

export interface PackSection {
  heading: string;
  body: string;
}

/**
 * The contract types `content` as free-form JSON. This client renders exactly
 * two shapes and refuses anything else rather than guessing at structure.
 */
export function packSections(pack: Pick<StudentInstructionPack, 'title' | 'content'>): PackSection[] | null {
  const content = pack.content as { sections?: unknown; body?: unknown };
  if (Array.isArray(content.sections)) {
    const sections = content.sections.filter(
      (s): s is PackSection =>
        typeof s === 'object' && s !== null && typeof (s as PackSection).heading === 'string' && typeof (s as PackSection).body === 'string',
    );
    return sections.length === content.sections.length && sections.length > 0 ? sections : null;
  }
  if (typeof content.body === 'string') return [{ heading: pack.title, body: content.body }];
  return null;
}

export interface DisplayPack {
  pack: StudentInstructionPack;
  kind: PackKind;
  sections: PackSection[] | null;
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

export function toDisplayPacks(records: CachedRecord<StudentInstructionPack>[], now: Date): DisplayPack[] {
  return records
    .flatMap((record) => {
      const kind = classifyPack(record.pack);
      if (!kind) return [];
      const expiresAt = record.pack.expiresAt ? Date.parse(record.pack.expiresAt) : Number.NaN;
      return [
        {
          pack: record.pack,
          kind,
          sections: packSections(record.pack),
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
  store: GroupedCacheStore<StudentInstructionPack>,
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
  store: GroupedCacheStore<StudentInstructionPack>,
  language: string,
  cached: DisplayPack[],
  now: Date,
): Promise<PacksView> {
  const result = await api.listInstructionPacks(language);
  if (result.kind === 'error') return { packs: cached, refresh: result.problem, storageFailed: false };

  const fetchedAt = now.toISOString();
  const records: CachedRecord<StudentInstructionPack>[] = result.packs
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
