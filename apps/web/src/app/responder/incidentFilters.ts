import type { Incident } from '../api/sahaya';

export type StatusFilter = 'OPEN' | 'ALL' | Incident['verificationStatus'];
export type SortOrder = 'NEWEST' | 'OLDEST' | 'LEVEL';
export type TimeWindow = 'ALL' | '1H' | '24H' | '7D';

export interface IncidentFilter {
  text: string;
  type: string;
  status: StatusFilter;
  level: 'ANY' | '1' | '2' | '3';
  buildingId: string;
  floorId: string;
  window: TimeWindow;
  sort: SortOrder;
}

export const DEFAULT_FILTER: IncidentFilter = {
  text: '',
  type: '',
  status: 'OPEN',
  level: 'ANY',
  buildingId: '',
  floorId: '',
  window: 'ALL',
  sort: 'LEVEL',
};

const WINDOW_MS: Record<Exclude<TimeWindow, 'ALL'>, number> = {
  '1H': 3_600_000,
  '24H': 86_400_000,
  '7D': 604_800_000,
};

const isOpen = (i: Incident) =>
  i.verificationStatus !== 'RESOLVED' && i.verificationStatus !== 'DISMISSED';

/** Filters and sorts the staff incident list. Pure, so it is easy to test. */
export function applyIncidentFilter(
  items: readonly Incident[],
  f: IncidentFilter,
  now: number,
): Incident[] {
  const needle = f.text.trim().toLowerCase();
  const out = items.filter((i) => {
    if (f.status === 'OPEN' ? !isOpen(i) : f.status !== 'ALL' && i.verificationStatus !== f.status)
      return false;
    if (f.type && i.type !== f.type) return false;
    if (f.level !== 'ANY' && String(i.level ?? '') !== f.level) return false;
    if (f.buildingId && i.buildingId !== f.buildingId) return false;
    if (f.floorId && i.floorId !== f.floorId) return false;
    if (f.window !== 'ALL' && now - Date.parse(i.serverReceivedAt) > WINDOW_MS[f.window])
      return false;
    if (needle && !`${i.id} ${i.type} ${i.description}`.toLowerCase().includes(needle))
      return false;
    return true;
  });
  const byTime = (a: Incident, b: Incident) => b.serverReceivedAt.localeCompare(a.serverReceivedAt);
  return out.sort(
    f.sort === 'NEWEST'
      ? byTime
      : f.sort === 'OLDEST'
        ? (a, b) => -byTime(a, b)
        : (a, b) => (b.level ?? 0) - (a.level ?? 0) || byTime(a, b),
  );
}

/** Distinct incident types present, for the type filter. */
export function incidentTypes(items: readonly Incident[]): string[] {
  return [...new Set(items.map((i) => i.type))].sort();
}

export const prettyType = (type: string) => type.toLowerCase().replace(/_/g, ' ');
