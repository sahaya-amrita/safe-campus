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
 */

export interface GraphNode {
  id: string;
  lat: number;
  lng: number;
  label?: string | undefined;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** False marks steps or other barriers to wheelchair access. */
  accessible?: boolean | undefined;
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
  }
  for (const [index, edge] of graph.edges.entries()) {
    if (!ids.has(edge.from) || !ids.has(edge.to))
      problems.push(`Edge ${index} refers to a missing node`);
    if (edge.from === edge.to) problems.push(`Edge ${index} connects a node to itself`);
  }
  return problems.slice(0, 20);
}

type Adjacency = Map<string, { to: string; cost: number }[]>;

function adjacency(graph: Graph, blocked: readonly Blocked[], accessibleOnly: boolean): Adjacency {
  const node = new Map(graph.nodes.map((n) => [n.id, n]));
  const adj: Adjacency = new Map(graph.nodes.map((n) => [n.id, []]));
  for (const edge of graph.edges) {
    if (accessibleOnly && edge.accessible === false) continue;
    const a = node.get(edge.from);
    const b = node.get(edge.to);
    if (!a || !b) continue;
    if (blocked.some((blk) => distanceToSegmentM(blk, a, b) <= blk.radiusM)) continue;
    const cost = distanceM(a, b);
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

export function nearestNode(
  graph: Graph,
  point: { lat: number; lng: number },
): { node: GraphNode; distanceM: number } | null {
  let best: { node: GraphNode; distanceM: number } | null = null;
  for (const node of graph.nodes) {
    const d = distanceM(point, node);
    if (!best || d < best.distanceM) best = { node, distanceM: d };
  }
  return best;
}
