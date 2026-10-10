import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe as group, expect, it } from 'vitest';
import { parseCampusData } from './campus-model.ts';
import {
  buildWalkGraph,
  describe,
  featureCentre,
  findSafeRoute,
  openGrounds,
  projectOnSegment,
  RISK_BUFFER_M,
  unprojectPoint,
  type Point,
  type RiskArea,
} from './safe-route.ts';

const data = parseCampusData(
  JSON.parse(readFileSync(resolve(process.cwd(), 'public/demo-map/campus-data.json'), 'utf8')),
);
const graph = buildWalkGraph(data);
const grounds = openGrounds(data);
const building = (name: string) => {
  const f = data.features.find((x) => x.kind === 'building' && x.tags.name === name);
  if (!f) throw new Error(`missing ${name}`);
  return featureCentre(f, data);
};

function components() {
  const seen = new Int32Array(graph.nodes.length).fill(-1);
  const sizes: number[] = [];
  for (let s = 0; s < graph.nodes.length; s++) {
    if (seen[s] !== -1) continue;
    const stack = [s];
    seen[s] = sizes.length;
    let size = 0;
    while (stack.length) {
      const n = stack.pop()!;
      size++;
      for (const { to } of graph.adjacency[n]!)
        if (seen[to] === -1) {
          seen[to] = sizes.length;
          stack.push(to);
        }
    }
    sizes.push(size);
  }
  return sizes.sort((a, b) => b - a);
}

const minDistanceTo = (path: readonly Point[], p: Point) =>
  Math.min(...path.slice(1).map((q, i) => projectOnSegment(p, path[i]!, q).d));

group('walk graph from OSM paths', () => {
  it('joins most mapped paths into one network', () => {
    const sizes = components();
    expect(graph.edges.length).toBeGreaterThan(200);
    expect(sizes[0]! / graph.nodes.length).toBeGreaterThan(0.8);
  });

  it('offers several large open grounds as candidate destinations', () => {
    expect(grounds.length).toBeGreaterThanOrEqual(3);
    expect(grounds.every((g) => g.areaM2 >= 1500)).toBe(true);
  });
});

group('findSafeRoute', () => {
  const start = building('Academic Block 1 - School of Engineering');

  it('finds a walking route with distance, time and steps', () => {
    const r = findSafeRoute(graph, start, [], grounds);
    expect(r.status).toBe('ROUTE');
    if (r.status !== 'ROUTE') return;
    expect(r.distanceM).toBeGreaterThan(20);
    expect(r.walkSeconds).toBeCloseTo(r.distanceM / 1.3);
    expect(r.steps.at(-1)!.instruction).toBe(`Arrive at ${r.destination.label}`);
    expect(r.path[0]).toEqual(start);
  });

  it('routes around a risk area on the direct route and keeps out of its core', () => {
    const direct = findSafeRoute(graph, start, [], grounds);
    if (direct.status !== 'ROUTE') throw new Error('expected a route');
    // Put a hazard in the middle of the unobstructed route.
    const mid = direct.path[Math.floor(direct.path.length / 2)]!;
    const hazard: RiskArea = {
      id: 'h',
      kind: 'VERIFIED_INCIDENT',
      label: 'Fire',
      centre: mid,
      radius: 25,
    };
    const detour = findSafeRoute(graph, start, [hazard], grounds);
    expect(detour.status).toBe('ROUTE');
    if (detour.status !== 'ROUTE') return;
    expect(minDistanceTo(detour.path, mid)).toBeGreaterThanOrEqual(25);
  });

  it('leads out first when the start is inside the risk area', () => {
    const hazard: RiskArea = {
      id: 'h',
      kind: 'REPORTED_INCIDENT',
      label: 'Smoke',
      centre: start,
      radius: 40,
    };
    const r = findSafeRoute(graph, start, [hazard], grounds);
    expect(r.status).toBe('ROUTE');
    if (r.status !== 'ROUTE') return;
    expect(r.startsInRisk).toBe(true);
    const d = Math.hypot(r.destination.centre[0] - start[0], r.destination.centre[1] - start[1]);
    expect(d).toBeGreaterThanOrEqual(40 + RISK_BUFFER_M);
  });

  it('never sends people to a destination inside or beside a risk area', () => {
    const first = findSafeRoute(graph, start, [], grounds);
    if (first.status !== 'ROUTE') throw new Error('expected a route');
    const atGround: RiskArea = {
      id: 'g',
      kind: 'ALERT_AREA',
      label: 'Alert',
      centre: first.destination.centre,
      radius: 30,
    };
    const r = findSafeRoute(graph, start, [atGround], grounds);
    expect(r.status === 'ROUTE' && r.destination.id).not.toBe(first.destination.id);
  });

  it('says so when every destination is at risk instead of guessing', () => {
    const risks = grounds.map((g, i) => ({
      id: String(i),
      kind: 'WHAT_IF' as const,
      label: 'x',
      centre: g.centre,
      radius: 20,
    }));
    expect(findSafeRoute(graph, start, risks, grounds)).toEqual({
      status: 'NO_ROUTE',
      reason: 'ALL_DESTINATIONS_AT_RISK',
    });
  });

  it('reports a blocked network when the only way out is through a risk area', () => {
    // A ring of risk around the start (but not containing it) blocks every path.
    const ring: RiskArea[] = Array.from({ length: 24 }, (_, i) => ({
      id: String(i),
      kind: 'WHAT_IF',
      label: 'x',
      centre: [
        start[0] + 120 * Math.cos((i * Math.PI) / 12),
        start[1] + 120 * Math.sin((i * Math.PI) / 12),
      ],
      radius: 20,
    }));
    const outside = grounds.filter(
      (g) => Math.hypot(g.centre[0] - start[0], g.centre[1] - start[1]) > 200,
    );
    expect(outside.length).toBeGreaterThan(0);
    const r = findSafeRoute(graph, start, ring, outside);
    expect(r).toEqual({ status: 'NO_ROUTE', reason: 'BLOCKED' });
  });
});

group('unprojectPoint', () => {
  it('round-trips with projectCoordinate within centimetres', async () => {
    const { projectCoordinate } = await import('./campus-model.ts');
    const lonLat: [number, number] = [76.9, 10.9036];
    const back = unprojectPoint(projectCoordinate(lonLat, data.bounds) as Point, data.bounds);
    expect(back[0]).toBeCloseTo(lonLat[0], 7);
    expect(back[1]).toBeCloseTo(lonLat[1], 7);
  });
});

group('describe', () => {
  it('turns a path into a heading, turns and arrival', () => {
    const steps = describe(
      [
        [0, 0],
        [0, -100],
        [100, -100],
      ],
      'Open ground',
    );
    expect(steps).toEqual([
      { instruction: 'Head north', distanceM: 100 },
      { instruction: 'Turn right', distanceM: 100 },
      { instruction: 'Arrive at Open ground', distanceM: 0 },
    ]);
  });
});
