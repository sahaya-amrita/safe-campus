/**
 * Route graph and path search for approved navigation data (Phase 5).
 *
 * Routes are computed only over an APPROVED route graph (two-person
 * approval) to APPROVED safe points. Community-mapped paths are never used:
 * with no approved data the app says "Navigation unavailable".
 *
 * A* uses straight-line distance as its heuristic, which never overestimates
 * walking distance, so it returns the same shortest distance as Dijkstra
 * (tested on random graphs). Edges that pass through an active blocked area
 * are removed before searching.
 *
 * Floors (Phase 8): nodes may carry a floor number (ground = 0; missing
 * means 0). Edges between floors must be STAIRS or RAMP, and cost their
 * walking distance plus a fixed effort per floor climbed, so the heuristic
 * still never overestimates. LIFT edges are kept in the data but never used:
 * lifts are not an evacuation route unless the institution designates one,
 * and that designation is not modelled. Step-free routing drops STAIRS.
 */

export interface GraphNode {
  id: string;
  lat: number;
  lng: number;
  label?: string | undefined;
  /** Floor number; ground = 0, basements negative. Missing means 0. */
  floor?: number | undefined;
}

export type EdgeKind = 'PATH' | 'STAIRS' | 'RAMP' | 'LIFT';

export interface GraphEdge {
  from: string;
  to: string;
  /** False marks steps or other barriers to wheelchair access. */
  accessible?: boolean | undefined;
  /** Missing means PATH. Only STAIRS, RAMP or LIFT may join different floors. */
  kind?: EdgeKind | undefined;
}

/** Walking effort added per floor of stairs, in metres of level walking. */
export const STAIR_EFFORT_M_PER_FLOOR = 15;

export const floorOf = (node: { floor?: number | undefined }) => node.floor ?? 0;

export interface FloorChange {
  /** Index in the path of the node where the change begins. */
  atStep: number;
  from: number;
  to: number;
  via: 'STAIRS' | 'RAMP';
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Blocked {
  lat: number;
  lng: number;
  radiusM: number;
}

export interface PathResult {
  nodeIds: string[];
  distanceM: number;
}

const EARTH_M = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance from point p to segment a–b, in metres (local flat approximation). */
export function distanceToSegmentM(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const kx = 111_320 * Math.cos(rad(p.lat));
  const ky = 110_540;
  const ax = (a.lng - p.lng) * kx;
  const ay = (a.lat - p.lat) * ky;
  const bx = (b.lng - p.lng) * kx;
  const by = (b.lat - p.lat) * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export type GraphProblem = string;

/** Structural checks for an uploaded graph. Returns a list of problems (empty = valid). */
export function validateGraph(graph: Graph): GraphProblem[] {
  const problems: GraphProblem[] = [];
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (ids.has(node.id)) problems.push(`Duplicate node id ${node.id}`);
    ids.add(node.id);
    if (!Number.isFinite(node.lat) || Math.abs(node.lat) > 90)
      problems.push(`Node ${node.id} has an invalid latitude`);
    if (!Number.isFinite(node.lng) || Math.abs(node.lng) > 180)
      problems.push(`Node ${node.id} has an invalid longitude`);
    if (node.floor !== undefined && (!Number.isInteger(node.floor) || Math.abs(node.floor) > 60))
      problems.push(`Node ${node.id} has an invalid floor`);
  }
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const [index, edge] of graph.edges.entries()) {
    if (!ids.has(edge.from) || !ids.has(edge.to))
      problems.push(`Edge ${index} refers to a missing node`);
    if (edge.from === edge.to) problems.push(`Edge ${index} connects a node to itself`);
    const a = nodeById.get(edge.from);
    const b = nodeById.get(edge.to);
    const kind = edge.kind ?? 'PATH';
    if (a && b && floorOf(a) !== floorOf(b) && kind === 'PATH')
      problems.push(`Edge ${index} joins two floors; mark it STAIRS, RAMP or LIFT`);
    if (kind === 'STAIRS' && edge.accessible === true)
      problems.push(`Edge ${index} is stairs and cannot be marked step-free`);
  }
  return problems.slice(0, 20);
}

type Adjacency = Map<string, { to: string; cost: number }[]>;

function adjacency(graph: Graph, blocked: readonly Blocked[], accessibleOnly: boolean): Adjacency {
  const node = new Map(graph.nodes.map((n) => [n.id, n]));
  const adj: Adjacency = new Map(graph.nodes.map((n) => [n.id, []]));
  for (const edge of graph.edges) {
    const kind = edge.kind ?? 'PATH';
    if (kind === 'LIFT') continue;
    if (accessibleOnly && (edge.accessible === false || kind === 'STAIRS')) continue;
    const a = node.get(edge.from);
    const b = node.get(edge.to);
    if (!a || !b) continue;
    if (blocked.some((blk) => distanceToSegmentM(blk, a, b) <= blk.radiusM)) continue;
    const floors = Math.abs(floorOf(a) - floorOf(b));
    const cost = distanceM(a, b) + (kind === 'STAIRS' ? floors * STAIR_EFFORT_M_PER_FLOOR : 0);
    adj.get(a.id)!.push({ to: b.id, cost });
    adj.get(b.id)!.push({ to: a.id, cost });
  }
  return adj;
}

/** Minimal binary heap keyed by priority. */
class Heap<T> {
  private items: { p: number; v: T }[] = [];
  get size() {
    return this.items.length;
  }
  push(v: T, p: number) {
    const items = this.items;
    items.push({ p, v });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent]!.p <= items[i]!.p) break;
      [items[parent], items[i]] = [items[i]!, items[parent]!];
      i = parent;
    }
  }
  pop(): T | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0]!.v;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && items[l]!.p < items[m]!.p) m = l;
        if (r < items.length && items[r]!.p < items[m]!.p) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i]!, items[m]!];
        i = m;
      }
    }
    return top;
  }
}

function search(
  graph: Graph,
  from: string,
  to: string,
  options: { blocked?: readonly Blocked[]; accessibleOnly?: boolean; heuristic: boolean },
): PathResult | null {
  const node = new Map(graph.nodes.map((n) => [n.id, n]));
  const goal = node.get(to);
  if (!node.has(from) || !goal) return null;
  const adj = adjacency(graph, options.blocked ?? [], options.accessibleOnly ?? false);
  const h = (id: string) => (options.heuristic ? distanceM(node.get(id)!, goal) : 0);
  const best = new Map<string, number>([[from, 0]]);
  const previous = new Map<string, string>();
  const open = new Heap<string>();
  open.push(from, h(from));
  const done = new Set<string>();
  while (open.size > 0) {
    const current = open.pop()!;
    if (done.has(current)) continue;
    if (current === to) {
      const nodeIds = [to];
      while (nodeIds[0] !== from) nodeIds.unshift(previous.get(nodeIds[0]!)!);
      return { nodeIds, distanceM: best.get(to)! };
    }
    done.add(current);
    for (const next of adj.get(current) ?? []) {
      const cost = best.get(current)! + next.cost;
      if (cost < (best.get(next.to) ?? Infinity)) {
        best.set(next.to, cost);
        previous.set(next.to, current);
        open.push(next.to, cost + h(next.to));
      }
    }
  }
  return null;
}

export function aStar(
  graph: Graph,
  from: string,
  to: string,
  options: { blocked?: readonly Blocked[]; accessibleOnly?: boolean } = {},
): PathResult | null {
  return search(graph, from, to, { ...options, heuristic: true });
}

/** Baseline used to check A* (same search without a heuristic). */
export function dijkstra(
  graph: Graph,
  from: string,
  to: string,
  options: { blocked?: readonly Blocked[]; accessibleOnly?: boolean } = {},
): PathResult | null {
  return search(graph, from, to, { ...options, heuristic: false });
}

/** Nearest node, optionally only among nodes on one floor. */
export function nearestNode(
  graph: Graph,
  point: { lat: number; lng: number },
  floor?: number,
): { node: GraphNode; distanceM: number } | null {
  let best: { node: GraphNode; distanceM: number } | null = null;
  for (const node of graph.nodes) {
    if (floor !== undefined && floorOf(node) !== floor) continue;
    const d = distanceM(point, node);
    if (!best || d < best.distanceM) best = { node, distanceM: d };
  }
  return best;
}

/** Where a path changes floor, and how (for step-by-step guidance). */
export function floorChanges(graph: Graph, nodeIds: readonly string[]): FloorChange[] {
  const node = new Map(graph.nodes.map((n) => [n.id, n]));
  const edgeKind = new Map<string, EdgeKind>();
  for (const e of graph.edges) {
    if (e.kind === 'LIFT') continue; // never part of a route
    edgeKind.set(`${e.from}|${e.to}`, e.kind ?? 'PATH');
    edgeKind.set(`${e.to}|${e.from}`, e.kind ?? 'PATH');
  }
  const changes: FloorChange[] = [];
  for (let i = 0; i + 1 < nodeIds.length; i++) {
    const from = floorOf(node.get(nodeIds[i]!)!);
    const to = floorOf(node.get(nodeIds[i + 1]!)!);
    if (from === to) continue;
    const kind = edgeKind.get(`${nodeIds[i]}|${nodeIds[i + 1]}`);
    changes.push({ atStep: i, from, to, via: kind === 'RAMP' ? 'RAMP' : 'STAIRS' });
  }
  return changes;
}
