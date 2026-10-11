import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { Config } from './config.js';
import type { DatabasePool } from './db.js';
import { aStar, dijkstra, distanceM, validateGraph, type Graph } from './navigation/graph.js';
import { issueAccessToken } from './security.js';
import { createTestPool, seedTestIdentity } from './test-support/database.js';

/** Seeded pseudo-random numbers so failures are reproducible. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function randomGraph(seed: number, size: number): Graph {
  const r = rng(seed);
  const nodes = Array.from({ length: size }, (_, i) => ({
    id: `n${i}`,
    lat: 10.9 + r() * 0.01,
    lng: 76.9 + r() * 0.01,
  }));
  const edges: Graph['edges'] = [];
  for (let i = 1; i < size; i++) edges.push({ from: `n${i}`, to: `n${Math.floor(r() * i)}` });
  for (let k = 0; k < size; k++)
    edges.push({ from: `n${Math.floor(r() * size)}`, to: `n${Math.floor(r() * size)}` });
  return { nodes, edges: edges.filter((e) => e.from !== e.to) };
}

/** A small corridor: A–B–C straight, with a longer detour A–D–C. */
const corridor: Graph = {
  nodes: [
    { id: 'A', lat: 10.9, lng: 76.9 },
    { id: 'B', lat: 10.9, lng: 76.9009 },
    { id: 'C', lat: 10.9, lng: 76.9018 },
    { id: 'D', lat: 10.9009, lng: 76.9009 },
  ],
  edges: [
    { from: 'A', to: 'B' },
    { from: 'B', to: 'C', accessible: false },
    { from: 'A', to: 'D' },
    { from: 'D', to: 'C' },
  ],
};

describe('path search', () => {
  it('A* finds the same shortest distance as Dijkstra on 200 random graphs', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const graph = randomGraph(seed, 40);
      const a = aStar(graph, 'n0', 'n39');
      const d = dijkstra(graph, 'n0', 'n39');
      expect(Boolean(a)).toBe(Boolean(d));
      if (a && d) expect(a.distanceM).toBeCloseTo(d.distanceM, 6);
    }
  });

  it('avoids blocked areas, honours accessibility and reports no route honestly', () => {
    expect(aStar(corridor, 'A', 'C')!.nodeIds).toEqual(['A', 'B', 'C']);
    const midB = { lat: 10.9, lng: 76.90135, radiusM: 20 };
    expect(aStar(corridor, 'A', 'C', { blocked: [midB] })!.nodeIds).toEqual(['A', 'D', 'C']);
    expect(aStar(corridor, 'A', 'C', { accessibleOnly: true })!.nodeIds).toEqual(['A', 'D', 'C']);
    const everywhere = { lat: 10.9, lng: 76.9, radiusM: 50 };
    expect(aStar(corridor, 'A', 'C', { blocked: [everywhere] })).toBeNull();
  });

  it('validates uploaded graphs', () => {
    expect(validateGraph(corridor)).toEqual([]);
    expect(
      validateGraph({
        nodes: [
          { id: 'X', lat: 1, lng: 1 },
          { id: 'X', lat: 1, lng: 1 },
        ],
        edges: [{ from: 'X', to: 'Y' }],
      }),
    ).toEqual(['Duplicate node id X', 'Edge 0 refers to a missing node']);
    expect(distanceM({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111_195, -2);
  });
});

const config: Config = {
  NODE_ENV: 'test',
  PORT: 3000,
  DATABASE_URL: 'postgres://test:test@localhost/test',
  TEST_DATABASE_URL: 'postgres://test:test@localhost/test',
  JWT_SECRET: 'test-secret-with-more-than-thirty-two-characters',
  JWT_ISSUER: 'sahaya-tests',
  JWT_AUDIENCE: 'sahaya-api-tests',
  LOG_LEVEL: 'silent',
  OPERATING_MODE: 'TEST',
  OUTBOX_BATCH_SIZE: 25,
};

describe('navigation API', () => {
  let pool: DatabasePool;
  let app: ReturnType<typeof createApp>;
  const tokens: Record<string, string> = {};
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });

  beforeEach(async () => {
    pool = await createTestPool();
    app = createApp(pool, config);
    for (const [key, roles] of [
      ['adminA', ['ADMIN']],
      ['adminB', ['ADMIN']],
      ['student', ['STUDENT']],
      ['responder', ['RESPONDER']],
    ] as const) {
      const id = await seedTestIdentity(pool, {
        email: `${key}@test.invalid`,
        displayName: key,
        roles: [...roles],
      });
      tokens[key] = await issueAccessToken(config, {
        id,
        email: `${key}@test.invalid`,
        roles: [...roles],
      });
    }
  });
  afterEach(async () => {
    if (pool) await pool.end();
  });

  async function upload(who = 'adminA') {
    return request(app)
      .post('/api/v1/admin/navigation/route-graphs')
      .set(auth(who))
      .send({ version: 'v1', source: 'Synthetic test survey', ...corridor, reason: 'Test graph' });
  }
  async function propose(who = 'adminA') {
    return request(app).post('/api/v1/admin/navigation/safe-points').set(auth(who)).send({
      name: 'Assembly point C',
      kind: 'ASSEMBLY_POINT',
      latitude: 10.9,
      longitude: 76.9018,
      reason: 'Test point',
    });
  }
  const review = (path: string, who: string, decision = 'APPROVE') =>
    request(app).post(path).set(auth(who)).send({ decision, reason: 'Reviewed on site' });
  const route = (safePointId: string, extra = '') =>
    request(app)
      .get(`/api/v1/maps/route?fromLat=10.9&fromLng=76.9&safePointId=${safePointId}${extra}`)
      .set(auth('student'));

  it('is unavailable until a second administrator approves both graph and safe point', async () => {
    let status = await request(app).get('/api/v1/maps/navigation').set(auth('student'));
    expect(status.body).toMatchObject({
      available: false,
      reason: 'no verified route data has been approved.',
    });

    const graph = await upload();
    expect(graph.status).toBe(201);
    const point = await propose();
    expect((await route((point.body as { id: string }).id)).body.error.code).toBe(
      'NAVIGATION_UNAVAILABLE',
    );

    // The uploader/proposer cannot approve their own work.
    const self = await review(
      `/api/v1/admin/navigation/route-graphs/${graph.body.id}/review`,
      'adminA',
    );
    expect(self.status).toBe(409);
    expect(self.body.error.code).toBe('SAME_PERSON');
    expect(
      (await review(`/api/v1/admin/navigation/route-graphs/${graph.body.id}/review`, 'adminB'))
        .status,
    ).toBe(200);

    status = await request(app).get('/api/v1/maps/navigation').set(auth('student'));
    expect(status.body.reason).toBe('no safe points have been approved.');
    // Students do not see proposed safe points; staff do.
    expect(
      (await request(app).get('/api/v1/maps/safe-points').set(auth('student'))).body.items,
    ).toHaveLength(0);
    expect(
      (await request(app).get('/api/v1/maps/safe-points').set(auth('responder'))).body.items,
    ).toHaveLength(1);

    await review(`/api/v1/admin/navigation/safe-points/${point.body.id}/review`, 'adminB');
    status = await request(app).get('/api/v1/maps/navigation').set(auth('student'));
    expect(status.body).toMatchObject({ available: true, reason: null, graph: { version: 'v1' } });

    const found = await route((point.body as { id: string }).id);
    expect(found.status).toBe(200);
    expect(found.body).toMatchObject({ graphVersion: 'v1', blocksAvoided: 0, startSnapM: 0 });
    expect(found.body.path).toHaveLength(3);
    expect(found.body.note).toMatch(/follow alarms, staff and signs/);

    const audit = await pool.query<{ action: string }>(
      `SELECT action FROM audit_events WHERE entity_type IN ('ROUTE_GRAPH', 'SAFE_POINT') ORDER BY id`,
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      'ROUTE_GRAPH_UPLOADED',
      'SAFE_POINT_PROPOSED',
      'ROUTE_GRAPH_APPROVED',
      'SAFE_POINT_APPROVED',
    ]);
  });

  it('routes around responder-marked blocks and says when none is possible', async () => {
    const graph = await upload();
    await review(`/api/v1/admin/navigation/route-graphs/${graph.body.id}/review`, 'adminB');
    const point = await propose();
    await review(`/api/v1/admin/navigation/safe-points/${point.body.id}/review`, 'adminB');

    const block = (lat: number, lng: number, radiusM: number) =>
      request(app)
        .post('/api/v1/maps/blocks')
        .set(auth('adminA'))
        .set('idempotency-key', `block-${randomUUID()}`)
        .send({ latitude: lat, longitude: lng, radiusM, reason: 'Fallen tree' });
    await block(10.9, 76.90135, 20);
    const detour = await route((point.body as { id: string }).id);
    expect(detour.body.path).toHaveLength(3);
    expect(detour.body.path[1]).toEqual({ lat: 10.9009, lng: 76.9009 });
    expect(detour.body.blocksAvoided).toBe(1);

    await block(10.9, 76.9, 50);
    const none = await route((point.body as { id: string }).id);
    expect(none.status).toBe(409);
    expect(none.body.error.code).toBe('NO_ROUTE');
  });

  it('refuses starts far from the approved routes and keeps admin endpoints closed', async () => {
    const graph = await upload();
    await review(`/api/v1/admin/navigation/route-graphs/${graph.body.id}/review`, 'adminB');
    const point = await propose();
    await review(`/api/v1/admin/navigation/safe-points/${point.body.id}/review`, 'adminB');
    const far = await request(app)
      .get(`/api/v1/maps/route?fromLat=10.95&fromLng=76.95&safePointId=${point.body.id}`)
      .set(auth('student'));
    expect(far.status).toBe(422);
    expect(far.body.error.code).toBe('START_OFF_NETWORK');

    expect((await upload('student')).status).toBe(403);
    const bad = await request(app)
      .post('/api/v1/admin/navigation/route-graphs')
      .set(auth('adminA'))
      .send({
        version: 'bad',
        source: 'Synthetic',
        nodes: [
          { id: 'A', lat: 10.9, lng: 76.9 },
          { id: 'B', lat: 10.9, lng: 76.91 },
        ],
        edges: [{ from: 'A', to: 'Z' }],
        reason: 'Broken graph',
      });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_GRAPH');
  });
});
