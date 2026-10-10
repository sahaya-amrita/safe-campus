/** Read-only visualisation DTO. OSM provenance never confers operational approval. */
export type CampusKind = 'boundary' | 'building' | 'road' | 'green' | 'sport' | 'water';
export type CampusCategory = 'academic' | 'residential' | 'dining' | 'facilities' | 'other';
export type Coordinate = readonly [number, number];
export interface CampusFeature {
  id: string;
  osmId: number;
  kind: CampusKind;
  version: number;
  updatedAt: string;
  tags: Readonly<Record<string, string>>;
  coordinates: readonly Coordinate[];
}
export interface CampusData {
  schema: 'safe-campus-osm-demo-v1';
  mode: 'DEMO';
  approval: 'UNVERIFIED';
  bounds: readonly [number, number, number, number];
  source: { name: string; license: string; url: string; downloadURL: string;
    attributionURL: string; retrievedAt: string; rawSHA256: string };
  features: readonly CampusFeature[];
}
export interface CampusAdapter { load(signal: AbortSignal): Promise<unknown>; }
const kinds = ['boundary', 'building', 'road', 'green', 'sport', 'water'];
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length < 600;
const date = (value: unknown): value is string => typeof value === 'string'
  && Number.isFinite(Date.parse(value)) && /Z$/.test(value);

export function parseCampusData(input: unknown): CampusData {
  const fail = () => { throw new Error('Invalid campus snapshot. No geometry displayed.'); };
  if (!record(input) || input.schema !== 'safe-campus-osm-demo-v1'
    || input.mode !== 'DEMO' || input.approval !== 'UNVERIFIED') return fail();
  if (!Array.isArray(input.bounds) || input.bounds.length !== 4
    || !input.bounds.every((n) => typeof n === 'number' && Number.isFinite(n))) return fail();
  const [west, south, east, north] = input.bounds as [number, number, number, number];
  if (west < 76.88 || east > 76.92 || south < 10.88 || north > 10.93 || west >= east || south >= north) return fail();
  const source = input.source;
  if (!record(source) || !nonempty(source.name) || source.license !== 'ODbL 1.0'
    || source.url !== 'https://www.openstreetmap.org/way/128964693'
    || source.attributionURL !== 'https://www.openstreetmap.org/copyright'
    || !nonempty(source.downloadURL) || !date(source.retrievedAt)
    || typeof source.rawSHA256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.rawSHA256)) return fail();
  if (!Array.isArray(input.features) || input.features.length > 1_000) return fail();
  const ids = new Set<string>();
  for (const value of input.features as unknown[]) {
    if (!record(value) || !nonempty(value.id) || !/^way\/\d+(?::\d+)?$/.test(value.id)
      || ids.has(value.id) || !Number.isSafeInteger(value.osmId) || Number(value.osmId) <= 0
      || !(value.id === `way/${String(value.osmId)}` || value.id.startsWith(`way/${String(value.osmId)}:`)) || !kinds.includes(String(value.kind))
      || !Number.isSafeInteger(value.version) || Number(value.version) < 1 || !date(value.updatedAt)
      || !record(value.tags) || Object.keys(value.tags).length > 20
      || !Object.values(value.tags).every((tag) => typeof tag === 'string' && tag.length <= 600)
      || !Array.isArray(value.coordinates) || value.coordinates.length > 2_000
      || value.coordinates.length < (value.kind === 'road' ? 2 : 4)) return fail();
    for (const p of value.coordinates as unknown[]) {
      if (!Array.isArray(p) || p.length !== 2 || !p.every((n) => typeof n === 'number' && Number.isFinite(n))
        || p[0] < west - .002 || p[0] > east + .002 || p[1] < south - .002 || p[1] > north + .002) return fail();
    }
    if (value.kind !== 'road') {
      const coordinates = value.coordinates as Coordinate[];
      const first = coordinates[0]!; const last = coordinates.at(-1)!;
      if (first[0] !== last[0] || first[1] !== last[1]) return fail();
    }
    ids.add(value.id);
  }
  if (input.features.length && input.features.filter((f: CampusFeature) => f.kind === 'boundary' && f.osmId === 128964693).length !== 1) return fail();
  return structuredClone(input) as unknown as CampusData;
}

export function categoryOf(feature: CampusFeature): CampusCategory {
  const t = feature.tags;
  if (['restaurant', 'fast_food', 'cafe'].includes(t.amenity ?? '') || /canteen|kitchen|mess/i.test(t.name ?? '')) return 'dining';
  if (['hostel', 'guest_house'].includes(t.tourism ?? '') || ['apartments', 'residential', 'dormitory'].includes(t.building ?? '')) return 'residential';
  if (t.amenity || t.leisure || /auditorium|hall/i.test(t.name ?? '')) return 'facilities';
  if (t.building === 'university') return 'academic';
  return 'other';
}
export function featureName(feature: CampusFeature): string {
  return feature.tags['name:en'] || feature.tags.name || `Unnamed building · OSM ${feature.osmId}`;
}
export function heightOf(feature: CampusFeature): { metres: number; basis: string; estimated: boolean } {
  const height = Number((feature.tags.height ?? '').replace(/\s*m$/, ''));
  if (height > 0 && height < 100) return { metres: height, basis: 'OSM height tag; not institution-verified', estimated: false };
  const levels = Number(feature.tags['building:levels']);
  if (levels > 0 && levels <= 25) return { metres: levels * 3.2, basis: `${levels} OSM-tagged levels × assumed 3.2 m per level`, estimated: true };
  const category = categoryOf(feature);
  const metres = category === 'academic' ? 13 : category === 'residential' ? 12 : category === 'dining' ? 5 : 7;
  return { metres, basis: 'Illustrative category-based height; no height data in source', estimated: true };
}
/** Local tangent approximation in metres. X east, Z south. For rendering, never navigation. */
export function projectCoordinate([lon, lat]: Coordinate, bounds: CampusData['bounds']): Coordinate {
  const latitude = (bounds[1] + bounds[3]) / 2;
  return [(lon - (bounds[0] + bounds[2]) / 2) * 111_320 * Math.cos(latitude * Math.PI / 180),
    -(lat - latitude) * 111_320];
}
export function campusDirectory(data: CampusData, query = '', category = 'all'): CampusFeature[] {
  const needle = query.trim().toLocaleLowerCase();
  return data.features.filter((feature) => feature.kind === 'building'
    && (category === 'all' || categoryOf(feature) === category)
    && `${featureName(feature)} ${feature.osmId} ${categoryOf(feature)}`.toLocaleLowerCase().includes(needle))
    .sort((a, b) => Number(!a.tags.name) - Number(!b.tags.name) || featureName(a).localeCompare(featureName(b)));
}
export const campusNavigation = Object.freeze({ enabled: false, reason: 'Community-mapped geometry is not approved navigation data.' });
