import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@sahaya/contracts';
import { createApp } from './app.js';
import type { Config } from './config.js';
import type { DatabasePool } from './db.js';
import { hazardLevel } from './hazardLevel.js';
import { issueAccessToken } from './security.js';
import { createTestPool, seedTestIdentity, seedTestZone } from './test-support/database.js';

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

describe('hazardLevel', () => {
  it('derives L1/L2/L3 from stored facts and never reaches L3 without a person', () => {
    expect(hazardLevel('REPORTED', 1)).toBe(1);
    expect(hazardLevel('REPORTED', 2)).toBe(2);
    expect(hazardLevel('CORROBORATED', 1)).toBe(2);
    expect(hazardLevel('REPORTED', 50)).toBe(2);
    expect(hazardLevel('VERIFIED', 1)).toBe(3);
    expect(hazardLevel('RESOLVED', 3)).toBeNull();
    expect(hazardLevel('DISMISSED', 3)).toBeNull();
  });
});

describe('control room and drill control API', () => {
  let pool: DatabasePool;
  let app: ReturnType<typeof createApp>;
  let ids: Record<'student' | 'other' | 'verifier' | 'responder' | 'manager', string>;
  let zoneId: string;
  let buildingId: string;
  const tokens: Record<string, string> = {};

  const as = (who: keyof typeof ids) => `Bearer ${tokens[who]}`;

  beforeEach(async () => {
    pool = await createTestPool();
    app = createApp(pool, config);
    const people: [keyof typeof ids, Role][] = [
      ['student', 'STUDENT'],
      ['other', 'STUDENT'],
      ['verifier', 'INCIDENT_VERIFIER'],
      ['responder', 'RESPONDER'],
      ['manager', 'DRILL_MANAGER'],
    ];
    ids = {} as typeof ids;
    for (const [who, role] of people) {
      const email = `${who}@test.invalid`;
      ids[who] = await seedTestIdentity(pool, { email, displayName: who, roles: [role] });
      tokens[who] = await issueAccessToken(config, { id: ids[who], email, roles: [role] });
    }
    ({ zoneId, buildingId } = await seedTestZone(pool));
  });

  afterEach(async () => {
    if (pool) await pool.end();
  });

  const report = (who: 'student' | 'other', key: string) =>
    request(app)
      .post('/api/v1/incidents')
      .set('authorization', as(who))
      .set('idempotency-key', key)
      .send({
        type: 'SMOKE',
        description: 'Synthetic smoke in corridor',
        priority: 'HIGH',
        zoneId,
      });

  const createDrill = () =>
    request(app)
      .post('/api/v1/drills')
      .set('authorization', as('manager'))
      .set('idempotency-key', `drill-${Math.random()}`)
      .send({
        name: 'TEST drill',
        buildingId,
        scenarioRef: 'test-scenario',
        scenarioVersion: '1',
        mode: 'DRILL',
      });

  it('gives staff corroboration facts and a level, and students none of it', async () => {
    const first = await report('student', 'key-r-1-0000');
    const one = await request(app).get('/api/v1/incidents').set('authorization', as('verifier'));
    expect(one.body.items[0]).toMatchObject({
      id: first.body.id,
      reportCount: 1,
      independentReporters: 1,
      relatedIncidentIds: [],
      level: 1,
    });

    // A second person reports the same type in the same zone and window.
    const second = await report('other', 'key-r-2-0000');
    const two = await request(app).get('/api/v1/incidents').set('authorization', as('verifier'));
    const byId = new Map((two.body.items as { id: string }[]).map((i) => [i.id, i]));
    expect(byId.get(String(first.body.id))).toMatchObject({
      level: 2,
      independentReporters: 2,
      relatedIncidentIds: [second.body.id],
    });
    // Corroboration is display only: the stored status is unchanged.
    expect(byId.get(String(first.body.id))).toMatchObject({ verificationStatus: 'REPORTED' });

    const own = await request(app).get('/api/v1/incidents').set('authorization', as('student'));
    expect(own.body.items).toHaveLength(1);
    for (const field of [
      'level',
      'reportCount',
      'independentReporters',
      'relatedIncidentIds',
      'duplicateGroupKey',
    ])
      expect(own.body.items[0]).not.toHaveProperty(field);
  });

  it('lets responders mark and clear blocked areas that everyone can see', async () => {
    const body = { longitude: 76.9, latitude: 10.9036, radiusM: 25, reason: 'Fallen tree' };
    const denied = await request(app)
      .post('/api/v1/maps/blocks')
      .set('authorization', as('student'))
      .set('idempotency-key', 'key-b-0-0000')
      .send(body);
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post('/api/v1/maps/blocks')
      .set('authorization', as('responder'))
      .set('idempotency-key', 'key-b-1-0000')
      .send(body);
    expect(created.status).toBe(201);
    const replay = await request(app)
      .post('/api/v1/maps/blocks')
      .set('authorization', as('responder'))
      .set('idempotency-key', 'key-b-1-0000')
      .send(body);
    expect(replay.body.id).toBe(created.body.id);

    const offCampus = await request(app)
      .post('/api/v1/maps/blocks')
      .set('authorization', as('responder'))
      .set('idempotency-key', 'key-b-2-0000')
      .send({ ...body, longitude: 80 });
    expect(offCampus.status).toBe(400);

    const seen = await request(app).get('/api/v1/maps/blocks').set('authorization', as('student'));
    expect(seen.body.items).toEqual([
      expect.objectContaining({ id: created.body.id, radiusM: 25, reason: 'Fallen tree' }),
    ]);

    const cleared = await request(app)
      .post(`/api/v1/maps/blocks/${created.body.id}/clear`)
      .set('authorization', as('responder'));
    expect(cleared.body.clearedAt).not.toBeNull();
    const again = await request(app)
      .post(`/api/v1/maps/blocks/${created.body.id}/clear`)
      .set('authorization', as('responder'));
    expect(again.status).toBe(200);
    const after = await request(app).get('/api/v1/maps/blocks').set('authorization', as('student'));
    expect(after.body.items).toEqual([]);
    const audit = await pool.query<{ action: string }>(
      `SELECT action FROM audit_events WHERE entity_type = 'ROUTE_BLOCK' ORDER BY created_at`,
    );
    expect(audit.rows.map((r) => r.action)).toEqual(['ROUTE_BLOCK_CREATED', 'ROUTE_BLOCK_CLEARED']);
  });

  it('starts and stops drills, and the kill switch stops every active drill', async () => {
    const a = await createDrill();
    const b = await createDrill();
    const preflight = await request(app)
      .get('/api/v1/drills/preflight')
      .set('authorization', as('manager'));
    expect(preflight.body).toEqual({ verifiedIncidentsOpen: 0, activeDrills: 0, canStart: true });

    for (const drill of [a, b]) {
      const started = await request(app)
        .post(`/api/v1/drills/${drill.body.id}/start`)
        .set('authorization', as('manager'))
        .set('idempotency-key', `start-${drill.body.id}`);
      expect(started.body).toMatchObject({ status: 'ACTIVE', startedAt: expect.any(String) });
    }
    const responderStart = await request(app)
      .post(`/api/v1/drills/${a.body.id}/start`)
      .set('authorization', as('responder'))
      .set('idempotency-key', 'key-nope-0000');
    expect(responderStart.status).toBe(403);

    const stopOne = await request(app)
      .post(`/api/v1/drills/${a.body.id}/stop`)
      .set('authorization', as('responder'));
    expect(stopOne.body).toMatchObject({
      status: 'COMPLETED',
      stopReason: 'STOPPED_BY_CONTROLLER',
    });

    const kill = await request(app)
      .post('/api/v1/drills/stop-all')
      .set('authorization', as('verifier'));
    expect(kill.body).toEqual({ stopped: 1, drillIds: [b.body.id] });
    const list = await request(app).get('/api/v1/drills').set('authorization', as('student'));
    expect(list.body.items.every((d: { status: string }) => d.status === 'COMPLETED')).toBe(true);

    const restart = await request(app)
      .post(`/api/v1/drills/${a.body.id}/start`)
      .set('authorization', as('manager'))
      .set('idempotency-key', 'key-restart-0000');
    expect(restart.status).toBe(409);
  });

  it('blocks drill starts while a verified incident is open and suspends running drills on verification', async () => {
    const drill = await createDrill();
    await request(app)
      .post(`/api/v1/drills/${drill.body.id}/start`)
      .set('authorization', as('manager'))
      .set('idempotency-key', 'key-start-1-0000');

    const incident = await report('student', 'key-r-live-0000');
    const review = await request(app)
      .post(`/api/v1/incidents/${incident.body.id}/reviews`)
      .set('authorization', as('verifier'))
      .set('idempotency-key', 'key-verify-1-0000')
      .send({ status: 'VERIFIED', reason: 'Confirmed on CCTV (synthetic)' });
    expect(review.body).toMatchObject({ toStatus: 'VERIFIED', suspendedDrills: 1 });

    const list = await request(app).get('/api/v1/drills').set('authorization', as('manager'));
    expect(list.body.items[0]).toMatchObject({
      status: 'COMPLETED',
      stopReason: 'LIVE_INCIDENT_VERIFIED',
    });

    const next = await createDrill();
    const blocked = await request(app)
      .post(`/api/v1/drills/${next.body.id}/start`)
      .set('authorization', as('manager'))
      .set('idempotency-key', 'key-start-2-0000');
    expect(blocked.status).toBe(409);
    expect(blocked.body.error?.code ?? blocked.body.code).toBe('LIVE_INCIDENT_ACTIVE');
    const preflight = await request(app)
      .get('/api/v1/drills/preflight')
      .set('authorization', as('manager'));
    expect(preflight.body).toMatchObject({ verifiedIncidentsOpen: 1, canStart: false });
  });
});
