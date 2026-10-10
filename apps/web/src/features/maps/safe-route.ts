/**
 * Demonstration safe-route engine over community-mapped (OSM) campus paths.
 *
 * Honesty rules (docs/safety-rules.md, blueprint §11.4):
 * - The geometry is UNVERIFIED. Every result is a demonstration route, never an
 *   approved evacuation route, and callers must label it that way.
 * - Risk areas are avoided completely where possible; a buffer around them is
 *   penalised. If no route avoids them, the engine says so instead of guessing.
 * - Destinations are open grounds that are NOT designated assembly points.
 * Coordinates are local metres (x east, z south) from `projectCoordinate`.
 */
import {
  featureName,
  projectCoordinate,
  type CampusData,
  type CampusFeature,
} from './campus-model.ts';

export type Point = readonly [number, number];

export type RiskKind = 'VERIFIED_INCIDENT' | 'REPORTED_INCIDENT' | 'ALERT_AREA' | 'WHAT_IF';

export interface RiskArea {
  id: string;
  kind: RiskKind;
  label: string;
  centre: Point;
  /** Core radius in metres: paths inside it are avoided. */
  radius: number;
}

export interface SafeDestination {
  id: string;
  label: string;
  centre: Point;
  areaM2: number;
}

export interface RouteStep {
  instruction: string;
  distanceM: number;
}

export type RouteResult =
  | {
      status: 'ROUTE';
      path: Point[];
      distanceM: number;
      walkSeconds: number;
      destination: SafeDestination;
      steps: RouteStep[];
      /** True when the start is inside a risk area and the first part leaves it. */
      startsInRisk: boolean;
      /** The route passes close to (not through) a risk area. */
      nearRisk: boolean;
    }
  | { status: 'NO_ROUTE'; reason: 'NO_PATH_NETWORK' | 'ALL_DESTINATIONS_AT_RISK' | 'BLOCKED' };

export interface WalkGraph {
  nodes: Point[];
  edges: { a: number; b: number; length: number; name: string }[];
  adjacency: { to: number; edge: number }[][];
}

/** Average walking speed used for estimates (m/s). Estimates only. */
export const WALK_SPEED = 1.3;
/** Extra distance around a risk area whose paths are allowed but penalised. */
export const RISK_BUFFER_M = 35;
const BUFFER_PENALTY = 6;
const SNAP_M = 7;

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Closest point on segment ab to p, with t in [0, 1]. */
export function projectOnSegment(
  p: Point,
  a: Point,
  b: Point,
): { point: Point; t: number; d: number } {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2)) : 0;
  const point: Point = [a[0] + t * dx, a[1] + t * dz];
  return { point, t, d: dist(p, point) };
}

function centroid(points: readonly Point[]): Point {
  // Polygon area centroid; falls back to the vertex mean for degenerate rings.
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i]!;
    const q = points[i + 1]!;
    const cross = p[0] * q[1] - q[0] * p[1];
    a += cross;
    cx += (p[0] + q[0]) * cross;
    cz += (p[1] + q[1]) * cross;
  }
  if (Math.abs(a) < 1e-6) {
    const n = points.length || 1;
    return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cz / (3 * a)];
}

function polygonArea(points: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i]!;
    const q = points[i + 1]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

export function projectFeature(feature: CampusFeature, data: CampusData): Point[] {
  return feature.coordinates.map((c) => projectCoordinate(c, data.bounds));
}

/** Centre of a building (or other polygon) footprint, in local metres. */
export function featureCentre(feature: CampusFeature, data: CampusData): Point {
  return centroid(projectFeature(feature, data));
}

/**
 * Builds a walking network from every OSM path and road. Vertices closer than
 * SNAP_M are merged and dangling ends are joined to a nearby path, because
 * community-mapped junctions often miss each other by a few metres.
 */
export function buildWalkGraph(data: CampusData): WalkGraph {
  const nodes: Point[] = [];
  const grid = new Map<string, number[]>();
  const cell = (p: Point) => `${Math.floor(p[0] / SNAP_M)},${Math.floor(p[1] / SNAP_M)}`;
  const nodeFor = (p: Point): number => {
    const [cx, cz] = [Math.floor(p[0] / SNAP_M), Math.floor(p[1] / SNAP_M)];
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const id of grid.get(`${cx + i},${cz + j}`) ?? [])
          if (dist(nodes[id]!, p) <= SNAP_M) return id;
    nodes.push(p);
    const key = cell(p);
    grid.set(key, [...(grid.get(key) ?? []), nodes.length - 1]);
    return nodes.length - 1;
  };

  const raw: { a: number; b: number; name: string }[] = [];
  const ends: number[] = [];
  for (const feature of data.features) {
    if (feature.kind !== 'road') continue;
    const pts = projectFeature(feature, data);
    const name = feature.tags.name ?? '';
    let prev = nodeFor(pts[0]!);
    ends.push(prev);
    for (let i = 1; i < pts.length; i++) {
      const next = nodeFor(pts[i]!);
      if (next !== prev) raw.push({ a: prev, b: next, name });
      prev = next;
    }
    ends.push(prev);
  }

  // Join a dangling end to the interior of a nearby path (a missed T-junction).
  const degree = new Map<number, number>();
  for (const e of raw) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }
  for (const end of new Set(ends)) {
    if ((degree.get(end) ?? 0) !== 1) continue;
    let best: { edge: number; point: Point; d: number } | null = null;
    raw.forEach((e, index) => {
      if (e.a === end || e.b === end) return;
      const hit = projectOnSegment(nodes[end]!, nodes[e.a]!, nodes[e.b]!);
      if (hit.d <= SNAP_M * 1.5 && (!best || hit.d < best.d))
        best = { edge: index, point: hit.point, d: hit.d };
    });
    if (!best) continue;
    const { edge, point } = best as { edge: number; point: Point };
    const split = raw[edge]!;
    nodes.push(point);
    const mid = nodes.length - 1;
    raw.splice(
      edge,
      1,
      { a: split.a, b: mid, name: split.name },
      { a: mid, b: split.b, name: split.name },
    );
    raw.push({ a: end, b: mid, name: '' });
  }

  const edges = raw.map((e) => ({ ...e, length: dist(nodes[e.a]!, nodes[e.b]!) }));
  const adjacency: WalkGraph['adjacency'] = nodes.map(() => []);
  edges.forEach((e, index) => {
    adjacency[e.a]!.push({ to: e.b, edge: index });
    adjacency[e.b]!.push({ to: e.a, edge: index });
  });
  return { nodes, edges, adjacency };
}

/** Open grounds large enough to gather in. They are NOT designated assembly points. */
export function openGrounds(data: CampusData, minAreaM2 = 1500): SafeDestination[] {
  const landmarks = data.features
    .filter((f) => f.kind === 'building' && f.tags.name)
    .map((f) => ({ name: featureName(f), at: featureCentre(f, data) }));
  return data.features
    .filter((f) => f.kind === 'sport' || f.kind === 'green')
    .map((f) => {
      const ring = projectFeature(f, data);
      const centre = centroid(ring);
      const kind =
        f.tags.leisure === 'pitch'
          ? 'Sports pitch'
          : f.tags.leisure === 'playground'
            ? 'Playground'
            : 'Open ground';
      // Unnamed grounds are described by the nearest named building.
      const near = landmarks
        .map((l) => ({ ...l, d: dist(l.at, centre) }))
        .sort((a, b) => a.d - b.d)[0];
      const label = f.tags.name
        ? featureName(f)
        : near && near.d < 300
          ? `${kind} near ${near.name}`
          : kind;
      return { id: f.id, label, centre, areaM2: polygonArea(ring) };
    })
    .filter((d) => d.areaM2 >= minAreaM2);
}

function segmentRisk(a: Point, b: Point, risks: readonly RiskArea[]): 'BLOCKED' | 'NEAR' | 'CLEAR' {
  let near = false;
  for (const r of risks) {
    const d = projectOnSegment(r.centre, a, b).d;
    if (d < r.radius) return 'BLOCKED';
    if (d < r.radius + RISK_BUFFER_M) near = true;
  }
  return near ? 'NEAR' : 'CLEAR';
}

function nearestEdge(graph: WalkGraph, p: Point) {
  let best: { edge: number; point: Point; t: number; d: number } | null = null;
  graph.edges.forEach((e, index) => {
    const hit = projectOnSegment(p, graph.nodes[e.a]!, graph.nodes[e.b]!);
    if (!best || hit.d < best.d) best = { edge: index, ...hit };
  });
  return best as { edge: number; point: Point; t: number; d: number } | null;
}

class MinHeap {
  private items: [number, number][] = [];
  push(cost: number, node: number) {
    const a = this.items;
    a.push([cost, node]);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent]![0] <= a[i]![0]) break;
      [a[parent], a[i]] = [a[i]!, a[parent]!];
      i = parent;
    }
  }
  pop(): [number, number] | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]![0] < a[m]![0]) m = l;
        if (r < a.length && a[r]![0] < a[m]![0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
}

/**
 * Fastest walking route from `start` to the nearest reachable destination that
 * is outside every risk area (plus its buffer). Paths through a risk area are
 * excluded unless the start is inside that same area, so the route first leads
 * out of it. Costs are distances; the buffer multiplies cost, so "fastest" means
 * fastest among routes that keep away from known risk.
 */
export function findSafeRoute(
  graph: WalkGraph,
  start: Point,
  risks: readonly RiskArea[],
  destinations: readonly SafeDestination[],
): RouteResult {
  if (!graph.edges.length) return { status: 'NO_ROUTE', reason: 'NO_PATH_NETWORK' };
  const reachable = destinations.filter((d) =>
    risks.every((r) => dist(d.centre, r.centre) >= r.radius + RISK_BUFFER_M),
  );
  if (!reachable.length) return { status: 'NO_ROUTE', reason: 'ALL_DESTINATIONS_AT_RISK' };

  // A risk area the person is standing in cannot block their way out of it.
  const escaping = risks.filter((r) => dist(start, r.centre) < r.radius);
  const blocking = risks.filter((r) => !escaping.includes(r));
  const startsInRisk = escaping.length > 0;
  const weight = (a: Point, b: Point) => {
    const length = dist(a, b);
    const state = segmentRisk(a, b, blocking);
    if (state === 'BLOCKED') return Infinity;
    // Leaving a risk area is allowed but every metre inside it costs more.
    const inside = escaping.some((r) => projectOnSegment(r.centre, a, b).d < r.radius);
    return length * (state === 'NEAR' || inside ? BUFFER_PENALTY : 1);
  };

  const from = nearestEdge(graph, start);
  if (!from) return { status: 'NO_ROUTE', reason: 'NO_PATH_NETWORK' };
  const n = graph.nodes.length;
  const cost = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const heap = new MinHeap();
  const fromEdge = graph.edges[from.edge]!;
  const access = weight(start, from.point);
  for (const node of [fromEdge.a, fromEdge.b]) {
    const c = access + weight(from.point, graph.nodes[node]!);
    if (c < cost[node]!) {
      cost[node] = c;
      heap.push(c, node);
    }
  }
  while (heap.size) {
    const [c, node] = heap.pop()!;
    if (c > cost[node]!) continue;
    for (const { to, edge } of graph.adjacency[node]!) {
      const e = graph.edges[edge]!;
      const w = weight(graph.nodes[e.a]!, graph.nodes[e.b]!);
      if (c + w < cost[to]!) {
        cost[to] = c + w;
        prev[to] = node;
        heap.push(c + w, to);
      }
    }
  }

  let best: { total: number; node: number; dest: SafeDestination; entry: Point } | null = null;
  for (const dest of reachable) {
    const hit = nearestEdge(graph, dest.centre);
    if (!hit) continue;
    const e = graph.edges[hit.edge]!;
    for (const node of [e.a, e.b]) {
      const total =
        cost[node]! + weight(graph.nodes[node]!, hit.point) + weight(hit.point, dest.centre);
      if (total < (best?.total ?? Infinity)) best = { total, node, dest, entry: hit.point };
    }
  }
  if (!best || !Number.isFinite(best.total)) return { status: 'NO_ROUTE', reason: 'BLOCKED' };

  const chain: Point[] = [];
  for (let node = best.node; node !== -1; node = prev[node]!) chain.unshift(graph.nodes[node]!);
  const path = dedupe([start, from.point, ...chain, best.entry, best.dest.centre]);
  const distanceM = path.reduce((s, p, i) => (i ? s + dist(path[i - 1]!, p) : 0), 0);
  const nearRisk = path.some((p, i) => i > 0 && segmentRisk(path[i - 1]!, p, blocking) === 'NEAR');
  return {
    status: 'ROUTE',
    path,
    distanceM,
    walkSeconds: distanceM / WALK_SPEED,
    destination: best.dest,
    steps: describe(path, best.dest.label),
    startsInRisk,
    nearRisk,
  };
}

function dedupe(points: Point[]): Point[] {
  return points.filter((p, i) => i === 0 || dist(p, points[i - 1]!) > 0.5);
}

/** Compass bearing in degrees (0 = north) for local x-east, z-south metres. */
function bearing(a: Point, b: Point): number {
  return ((Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI + 360) % 360;
}

const COMPASS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
];

/** Plain-language steps: a heading, then a turn wherever direction changes by >40°. */
export function describe(path: readonly Point[], destinationLabel: string): RouteStep[] {
  if (path.length < 2) return [];
  const steps: RouteStep[] = [];
  let heading = bearing(path[0]!, path[1]!);
  let run = 0;
  let instruction = `Head ${COMPASS[Math.round(heading / 45) % 8]}`;
  for (let i = 1; i < path.length; i++) {
    const seg = dist(path[i - 1]!, path[i]!);
    const next = bearing(path[i - 1]!, path[i]!);
    const turn = ((next - heading + 540) % 360) - 180;
    if (i > 1 && Math.abs(turn) > 40 && run > 8) {
      steps.push({ instruction, distanceM: run });
      instruction = Math.abs(turn) > 135 ? 'Turn back' : turn > 0 ? 'Turn right' : 'Turn left';
      run = 0;
    }
    heading = next;
    run += seg;
  }
  steps.push({ instruction, distanceM: run });
  // A turn for the last few metres is noise: fold short steps into the previous one.
  const merged: RouteStep[] = [];
  for (const step of steps) {
    const last = merged.at(-1);
    if (last && step.distanceM < 10) last.distanceM += step.distanceM;
    else merged.push({ ...step });
  }
  merged.push({ instruction: `Arrive at ${destinationLabel}`, distanceM: 0 });
  return merged.map((s) => ({ ...s, distanceM: Math.round(s.distanceM) }));
}

export function formatWalk(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `about ${minutes} min walk`;
}
