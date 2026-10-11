import type { LocationView, ReportLocation } from '@sahaya/contracts';

/** Column order used by every table that stores a reporter's location. */
export const LOCATION_COLUMNS =
  'location_method, latitude, longitude, accuracy_m, location_captured_at, landmark';

/** Values for LOCATION_COLUMNS. A missing location is stored as all NULLs. */
export function locationValues(location: ReportLocation | undefined): unknown[] {
  if (!location) return [null, null, null, null, null, null];
  return [
    location.method,
    location.latitude ?? null,
    location.longitude ?? null,
    location.accuracyM ?? null,
    location.capturedAt ?? null,
    location.landmark ?? null,
  ];
}

/** SQL that selects the location columns of `alias` as camel-cased fields. */
export function locationSelect(alias: string): string {
  return `${alias}.location_method AS "locationMethod", ${alias}.latitude, ${alias}.longitude,
    ${alias}.accuracy_m AS "accuracyM", ${alias}.location_captured_at AS "locationCapturedAt",
    ${alias}.landmark`;
}

const LOCATION_KEYS = [
  'locationMethod',
  'latitude',
  'longitude',
  'accuracyM',
  'locationCapturedAt',
  'landmark',
] as const;

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/** Folds the flat location columns of a row into `location` (null when none was given). */
export function withLocation<T extends object>(
  row: T,
): Omit<T, (typeof LOCATION_KEYS)[number]> & { location: LocationView | null } {
  const record = row as Record<string, unknown>;
  const rest: Record<string, unknown> = { ...record };
  for (const key of LOCATION_KEYS) delete rest[key];
  const method = record.locationMethod as LocationView['method'] | null | undefined;
  const captured = record.locationCapturedAt as Date | string | null | undefined;
  const location: LocationView | null = method
    ? {
        method,
        latitude: num(record.latitude),
        longitude: num(record.longitude),
        accuracyM: num(record.accuracyM),
        capturedAt: captured ? new Date(captured).toISOString() : null,
        landmark: (record.landmark as string | null | undefined) ?? null,
      }
    : null;
  return { ...(rest as Omit<T, (typeof LOCATION_KEYS)[number]>), location };
}
