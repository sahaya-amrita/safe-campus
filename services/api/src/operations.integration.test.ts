import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@sahaya/contracts';
import { createApp } from './app.js';
import type { Config } from './config.js';
import type { DatabasePool } from './db.js';
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

let pool: DatabasePool;
let app: ReturnType<typeof createApp>;
let zoneId: string;
let otherZoneId: string;
let buildingId: string;
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};
const bearer = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });

async function person(key: string, roles: Role[]) {
  ids[key] = await seedTestIdentity(pool, {
    email: `${key}@test.invalid`,
    displayName: key,
    roles,
  });
  tokens[key] = await issueAccessToken(config, {
    id: ids[key]!,
    email: `${key}@test.invalid`,
    roles,
  });
}

beforeEach(async () => {
  pool = await createTestPool();
  app = createApp(pool, config);
  const zone = await seedTestZone(pool);
  zoneId = zone.zoneId;
  buildingId = zone.buildingId;
  otherZoneId = (
    await pool.query<{ id: string }>(
      `INSERT INTO zones (floor_id, name, zone_code, geometry_approved)
       VALUES ($1, 'TEST Zone B', 'TEST-ZB', false) RETURNING id`,
      [zone.floorId],
    )
  ).rows[0]!.id;
  await person('admin', ['ADMIN']);
  await person('responder', ['RESPONDER']);
  await person('farResponder', ['RESPONDER']);
  await person('studentA', ['STUDENT']);
  await person('studentB', ['STUDENT']);
  await person('studentC', ['STUDENT']);
  await person('plainUser', ['STUDENT']);
});

afterEach(async () => {
  if (pool) await pool.end();
});

async function addResponder(user: string, zone: string | null) {
  const created = await request(app).post('/api/v1/admin/responders').set(bearer('admin')).send({
    userId: ids[user],
    approvedRole: 'Synthetic first aider',
    zoneId: zone,
    reason: 'Drill roster',
  });
  return created;
}

describe('responder roster (ADMIN)', () => {
  it('adds an unverified, off-duty profile only for users with the RESPONDER role', async () => {
    const notResponder = await addResponder('plainUser', zoneId);
    expect(notResponder.status).toBe(409);

    const created = await addResponder('responder', zoneId);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      displayName: 'responder',
      zoneId,
      zoneName: 'TEST Zone',
      verified: false,
      availability: 'OFF_DUTY',
    });
    expect((await addResponder('responder', zoneId)).status).toBe(409);

    const list = await request(app).get('/api/v1/admin/responders').set(bearer('admin'));
    expect(list.body.items).toHaveLength(1);
    expect(list.body.zones.map((z: { name: string }) => z.name)).toEqual([
      'TEST Zone',
      'TEST Zone B',
    ]);

    expect(
      (await request(app).get('/api/v1/admin/responders').set(bearer('responder'))).status,
    ).toBe(403);
  });

  it('verifies, moves and un-verifies a responder; every change is audited', async () => {
    const created = await addResponder('responder', zoneId);
    const id = created.body.id as string;
    const verify = await request(app)
      .post(`/api/v1/admin/responders/${id}/verification`)
      .set(bearer('admin'))
      .send({ verified: true, reason: 'Checked first-aid certificate' });
    expect(verify.body).toMatchObject({ verified: true });

    const moved = await request(app)
      .patch(`/api/v1/admin/responders/${id}`)
      .set(bearer('admin'))
      .send({ zoneId: otherZoneId, reason: 'Moved to block B' });
    expect(moved.body).toMatchObject({ zoneId: otherZoneId, zoneName: 'TEST Zone B' });

    await request(app).patch('/api/v1/responders/me/duty').set(bearer('responder')).send({
      availability: 'AVAILABLE',
    });
    const removed = await request(app)
      .post(`/api/v1/admin/responders/${id}/verification`)
      .set(bearer('admin'))
      .send({ verified: false, reason: 'Certificate expired' });
    expect(removed.body).toMatchObject({ verified: false, availability: 'OFF_DUTY' });

    const audit = await pool.query<{ action: string }>(
      `SELECT action FROM audit_events WHERE entity_type = 'RESPONDER' ORDER BY id`,
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      'RESPONDER_PROFILE_CREATED',
      'RESPONDER_VERIFIED',
      'RESPONDER_PROFILE_UPDATED',
      'RESPONDER_DUTY_CHANGED',
      'RESPONDER_VERIFICATION_REMOVED',
    ]);
  });
});

describe('duty status and the matched-request inbox', () => {
  it('only verified, on-duty responders are matched; the inbox shows and clears their notices', async () => {
    const created = await addResponder('responder', zoneId);
    await request(app)
      .post(`/api/v1/admin/responders/${created.body.id}/verification`)
      .set(bearer('admin'))
      .send({ verified: true, reason: 'Synthetic responder' });

    const sos = () =>
      request(app)
        .post('/api/v1/sos')
        .set(bearer('studentA'))
        .set('idempotency-key', `sos-${randomUUID()}`)
        .send({ clientActionId: randomUUID(), clientCreatedAt: new Date().toISOString() });

    // Off duty: not matched.
    await sos();
    let inbox = await request(app).get('/api/v1/responders/me/inbox').set(bearer('responder'));
    expect(inbox.body.items).toHaveLength(0);

    const duty = await request(app)
      .patch('/api/v1/responders/me/duty')
      .set(bearer('responder'))
      .send({ availability: 'AVAILABLE' });
    expect(duty.body).toMatchObject({ availability: 'AVAILABLE' });
    expect(duty.body.dutyChangedAt).toEqual(expect.any(String));

    await sos();
    inbox = await request(app).get('/api/v1/responders/me/inbox').set(bearer('responder'));
    expect(inbox.body.items).toHaveLength(1);
    expect(inbox.body).toMatchObject({ unseen: 1 });
    expect(inbox.body.note).toMatch(/In-app notices only/);

    await request(app)
      .post('/api/v1/responders/me/inbox/seen')
      .set(bearer('responder'))
      .send({ helpRequestIds: [inbox.body.items[0].helpRequestId] });
    inbox = await request(app).get('/api/v1/responders/me/inbox').set(bearer('responder'));
    expect(inbox.body.unseen).toBe(0);
  });

  it('explains when a responder has no roster profile', async () => {
    const me = await request(app).get('/api/v1/responders/me').set(bearer('farResponder'));
    expect(me.status).toBe(404);
    expect(me.body.error.code).toBe('NO_RESPONDER_PROFILE');
    expect((await request(app).get('/api/v1/responders/me').set(bearer('studentA'))).status).toBe(
      403,
    );
  });
});

describe('roll call', () => {
  async function drill() {
    return (
      await pool.query<{ id: string }>(
        `INSERT INTO drills (name, building_id, scenario_ref, scenario_version, mode, status, created_by)
         VALUES ('Synthetic drill', $1, 'S-1', 'v1', 'TEST', 'ACTIVE', $2) RETURNING id`,
        [buildingId, ids.admin],
      )
    ).rows[0]!.id;
  }

  it('lists each student in the drill building as safe, needing help or no response', async () => {
    for (const s of ['studentA', 'studentB', 'studentC'])
      await pool.query(
        `INSERT INTO zone_memberships (user_id, zone_id, source) VALUES ($1, $2, 'DEMO')`,
        [ids[s], zoneId],
      );
    // A staff member in the same zone is not on the roll call.
    await pool.query(
      `INSERT INTO zone_memberships (user_id, zone_id, source) VALUES ($1, $2, 'DEMO')`,
      [ids.responder, zoneId],
    );
    const drillId = await drill();
    const checkIn = (who: string, status: string) =>
      request(app)
        .post('/api/v1/checkins')
        .set(bearer(who))
        .set('idempotency-key', `ci-${randomUUID()}`)
        .send({
          status,
          drillId,
          clientActionId: randomUUID(),
          clientCreatedAt: new Date().toISOString(),
        });
    await checkIn('studentA', 'CONFIRMED_SAFE');
    await checkIn('studentB', 'HELP_REQUESTED');

    const roll = await request(app).get(`/api/v1/roll-call/drills/${drillId}`).set(bearer('admin'));
    expect(roll.status).toBe(200);
    expect(roll.body.counts).toEqual({ SAFE: 1, NEEDS_HELP: 1, NO_RESPONSE: 1 });
    expect(
      roll.body.items.map((i: { displayName: string; status: string }) => [
        i.displayName,
        i.status,
      ]),
    ).toEqual([
      ['studentB', 'NEEDS_HELP'],
      ['studentC', 'NO_RESPONSE'],
      ['studentA', 'SAFE'],
    ]);
    expect(roll.body.items[0].helpRequestStatus).toBe('OPEN');
    expect(roll.body.note).toMatch(/does not mean someone is hurt/);
    const audited = await pool.query(
      `SELECT 1 FROM audit_events WHERE action = 'ROLL_CALL_VIEWED'`,
    );
    expect(audited.rows).toHaveLength(1);
  });

  it('keeps names away from students and from responders outside the zone', async () => {
    const drillId = await drill();
    expect(
      (await request(app).get(`/api/v1/roll-call/drills/${drillId}`).set(bearer('studentA')))
        .status,
    ).toBe(403);

    const far = await addResponder('farResponder', null);
    await request(app)
      .post(`/api/v1/admin/responders/${far.body.id}/verification`)
      .set(bearer('admin'))
      .send({ verified: true, reason: 'Synthetic responder' });
    expect(
      (await request(app).get(`/api/v1/roll-call/drills/${drillId}`).set(bearer('farResponder')))
        .status,
    ).toBe(403);

    const near = await addResponder('responder', zoneId);
    await request(app)
      .post(`/api/v1/admin/responders/${near.body.id}/verification`)
      .set(bearer('admin'))
      .send({ verified: true, reason: 'Synthetic responder' });
    expect(
      (await request(app).get(`/api/v1/roll-call/drills/${drillId}`).set(bearer('responder')))
        .status,
    ).toBe(200);
  });
});

describe('alerts about unverified incidents', () => {
  it('must be marked precautionary', async () => {
    const incident = await request(app)
      .post('/api/v1/incidents')
      .set(bearer('studentA'))
      .set('idempotency-key', 'incident-p4-001')
      .send({ type: 'Smoke', description: 'Smell of smoke', priority: 'HIGH', zoneId });
    const draft = (precautionary: boolean) =>
      request(app)
        .post('/api/v1/alerts')
        .set(bearer('admin'))
        .set('idempotency-key', `alert-${randomUUID()}`)
        .send({
          incidentId: incident.body.id,
          zoneIds: [zoneId],
          title: 'Smoke reported',
          message: 'Avoid block A until staff confirm it is safe.',
          precautionary,
          mode: 'TEST',
        });
    const confirmed = await draft(false);
    expect(confirmed.status).toBe(409);
    expect(confirmed.body.error.code).toBe('INCIDENT_NOT_VERIFIED');
    expect((await draft(true)).status).toBe(201);
  });
});
