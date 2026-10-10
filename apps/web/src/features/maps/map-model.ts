/** Temporary adapter DTOs, not shared API contracts. Coordinates are local drawing units. */
export type Point = readonly [number, number];
export interface Provenance {
  sourceId: string;
  version: string;
  updatedAt: string;
  expiresAt: string;
  approval: 'APPROVED' | 'UNVERIFIED';
}
export interface MapSource extends Provenance {
  label: string;
  attribution: string;
  kind: 'DEMO' | 'OPERATIONAL';
}
export interface MapFeature {
  id: string;
  label: string;
  kind: 'AREA' | 'ROUTE';
  points: readonly Point[];
  provenance: Provenance;
}
export interface MapDocument {
  source: MapSource;
  features: readonly MapFeature[];
}
export interface MapAdapter {
  load(signal: AbortSignal): Promise<unknown>;
}
export interface MapPolicy {
  /** Supplied by a trusted integration, never read from map payloads or URL parameters. */
  authorizedSourceIds: readonly string[];
  now: number;
}
export type MapTrust = 'DEMO' | 'VERIFIED' | 'STALE' | 'UNVERIFIED' | 'INVALID' | 'UNAVAILABLE';
export interface MapAssessment {
  trust: MapTrust;
  message: string;
  document: MapDocument | null;
  areas: readonly MapFeature[];
  routes: readonly MapFeature[];
  routeEnabled: boolean;
  withheld: number;
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 300;
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z');

function provenance(value: unknown): value is Provenance {
  return object(value) && text(value.sourceId) && text(value.version)
    && timestamp(value.updatedAt) && timestamp(value.expiresAt)
    && Date.parse(value.expiresAt) > Date.parse(value.updatedAt)
    && (value.approval === 'APPROVED' || value.approval === 'UNVERIFIED');
}

/** Reject malformed/oversized payloads before rendering any geometry. */
export function isMapDocument(value: unknown): value is MapDocument {
  if (!object(value) || !object(value.source) || !provenance(value.source)) return false;
  if (!text(value.source.label) || !text(value.source.attribution)
    || !['DEMO', 'OPERATIONAL'].includes(String(value.source.kind))) return false;
  if (!Array.isArray(value.features) || value.features.length > 500) return false;
  const ids = new Set<string>();
  return value.features.every((feature: unknown) => {
    if (!object(feature) || !text(feature.id) || ids.has(feature.id) || !text(feature.label)
      || !provenance(feature.provenance) || !['AREA', 'ROUTE'].includes(String(feature.kind))
      || !Array.isArray(feature.points) || feature.points.length > 1_000
      || feature.points.length < (feature.kind === 'AREA' ? 3 : 2)) return false;
    ids.add(feature.id);
    return feature.points.every((point: unknown) => Array.isArray(point) && point.length === 2
      && point.every((coordinate: unknown) => typeof coordinate === 'number'
        && Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1_000));
  });
}

function current(value: Provenance, now: number): boolean {
  return Date.parse(value.updatedAt) <= now && now < Date.parse(value.expiresAt);
}
function approved(value: Provenance, policy: MapPolicy): boolean {
  return value.approval === 'APPROVED' && policy.authorizedSourceIds.includes(value.sourceId);
}

export function assessMap(input: unknown, policy: MapPolicy): MapAssessment {
  const blocked = (trust: MapTrust, message: string): MapAssessment => ({
    trust, message, document: null, areas: [], routes: [], routeEnabled: false, withheld: 0,
  });
  if (input === null || input === undefined) return blocked('UNAVAILABLE', 'No map data available. Route guidance is disabled.');
  if (!Number.isFinite(policy.now) || !isMapDocument(input)) {
    return blocked('INVALID', 'Invalid map data. Route guidance is disabled.');
  }
  // Decouple validated geometry from any future mutation by the adapter.
  const document = structuredClone(input);
  if (document.source.kind === 'DEMO') {
    return {
      trust: 'DEMO', message: 'DEMO MAP — NOT FOR NAVIGATION', document,
      areas: document.features.filter((feature) => feature.kind === 'AREA'),
      routes: [], routeEnabled: false,
      withheld: document.features.filter((feature) => feature.kind === 'ROUTE').length,
    };
  }
  if (!approved(document.source, policy)) {
    return blocked('UNVERIFIED', 'Map source is not authorized and approved. Route guidance is disabled.');
  }
  if (!current(document.source, policy.now)) {
    return blocked('STALE', 'Map source is stale or not yet valid. Route guidance is disabled.');
  }
  // A route is unsafe without verified campus geometry as well as its own provenance.
  const eligible = document.features.filter((feature) => approved(feature.provenance, policy)
    && feature.provenance.sourceId === document.source.sourceId
    && feature.provenance.version === document.source.version
    && current(feature.provenance, policy.now));
  const areas = eligible.filter((feature) => feature.kind === 'AREA');
  const routes = areas.length ? eligible.filter((feature) => feature.kind === 'ROUTE') : [];
  return {
    trust: 'VERIFIED', message: 'Verified source data. Only current, approved features are displayed.',
    document, areas, routes, routeEnabled: routes.length > 0,
    withheld: document.features.length - areas.length - routes.length,
  };
}

export const DEMO_NOTICE = 'DEMO MAP — NOT FOR NAVIGATION';

/** Abstract rectangles, never an approximation of Amrita or another real campus. */
export function createDemoMap(): MapDocument {
  const provenance: Provenance = {
    sourceId: 'synthetic-diagram', version: '1', approval: 'UNVERIFIED',
    updatedAt: '2026-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z',
  };
  return {
    source: { ...provenance, kind: 'DEMO', label: 'Abstract demonstration diagram',
      attribution: 'SAFE CAMPUS synthetic fixture. No real campus geometry.' },
    features: [
      { id: 'a', label: 'Synthetic area A', kind: 'AREA', provenance: { ...provenance },
        points: [[120, 180], [360, 180], [360, 400], [120, 400]] },
      { id: 'b', label: 'Synthetic area B', kind: 'AREA', provenance: { ...provenance },
        points: [[570, 220], [820, 220], [820, 450], [570, 450]] },
      { id: 'c', label: 'Synthetic area C', kind: 'AREA', provenance: { ...provenance },
        points: [[260, 620], [690, 620], [690, 800], [260, 800]] },
    ],
  };
}

export const demoMapAdapter: MapAdapter = { async load() { return createDemoMap(); } };
