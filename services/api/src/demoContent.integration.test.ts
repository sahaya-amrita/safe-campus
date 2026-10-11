import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@sahaya/contracts';
import { createApp } from './app.js';
import type { Config } from './config.js';
import { withTransaction, type DatabasePool } from './db.js';
import { DEMO_PACKS, DEMO_REPORTS, DEMO_SAFE_POINTS, seedDemoContent } from './demo/demoContent.js';
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
  OPERATING_MODE: 'DEMO',
  OUTBOX_BATCH_SIZE: 25,
};

let pool: DatabasePool;
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};
const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });

beforeEach(async () => {
  pool = await createTestPool();
  const { zoneId } = await seedTestZone(pool);
  for (const [key, roles] of [
    ['admin', ['ADMIN']],
    ['verifier', ['INCIDENT_VERIFIER']],
    ['student', ['STUDENT']],
  ] as [string, Role[]][]) {
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
  await pool.query(
    `INSERT INTO zone_memberships (user_id, zone_id, source) VALUES ($1, $2, 'DEMO')`,
    [ids.student, zoneId],
  );
  // Twice: seeding must be idempotent.
  for (let i = 0; i < 2; i++)
    await withTransaction(pool, (client) =>
      seedDemoContent(client, {
        adminId: ids.admin!,
        verifierId: ids.verifier!,
        zoneId,
        studentId: ids.student!,
      }),
    );
});
afterEach(async () => {
  if (pool) await pool.end();
});

describe('DEMO content for the hosted prototype', () => {
  it('publishes labelled DEMO guides once', async () => {
    const app = createApp(pool, config);
    const packs = await request(app)
      .get('/api/v1/instruction-packs?language=en')
      .set(auth('student'));
    expect(packs.status).toBe(200);
    const items = packs.body.items as { title: string; sourceLabel: string }[];
    expect(items).toHaveLength(DEMO_PACKS.length);
    for (const item of items) {
      expect(item.title).toMatch(/^DEMO: /);
      expect(item.sourceLabel).toMatch(/Not reviewed by campus safety staff/);
    }
  });

  it('makes practice routes available, labelled as DEMO and not official', async () => {
    const app = createApp(pool, config);
    const nav = await request(app).get('/api/v1/maps/navigation').set(auth('student'));
    expect(nav.body.available).toBe(true);
    expect(nav.body.safePoints).toHaveLength(DEMO_SAFE_POINTS.length);
    for (const point of nav.body.safePoints as { name: string; notes: string }[]) {
      expect(point.name).toMatch(/^DEMO practice point/);
      expect(point.notes).toMatch(/Not an official assembly point/);
    }
    // From the AB2 lawn to the Library Garden practice point.
    const garden = (nav.body.safePoints as { id: string; name: string }[]).find((p) =>
      p.name.includes('Library Garden'),
    )!;
    const route = await request(app)
      .get(`/api/v1/maps/route?fromLat=10.903383&fromLng=76.898475&safePointId=${garden.id}`)
      .set(auth('student'));
    expect(route.status).toBe(200);
    expect(route.body.distanceM).toBeGreaterThan(0);
    expect(route.body.graphVersion).toBe('demo-osm-1');
    expect(route.body.practice).toBe(true);
    expect(route.body.note).toMatch(/Not an evacuation route/);
  });

  it('delivers one simulated DEMO drill alert to zone members', async () => {
    const app = createApp(pool, config);
    const inbox = await request(app).get('/api/v1/alerts/inbox').set(auth('student'));
    expect(inbox.status).toBe(200);
    expect(inbox.body.items).toHaveLength(1);
    expect(inbox.body.items[0]).toMatchObject({
      title: 'DEMO drill: practise checking in',
      precautionary: true,
      mode: 'DEMO',
    });
  });

  it('gives staff labelled DEMO work: unverified reports and one open help request', async () => {
    const app = createApp(pool, config);
    const incidents = await request(app).get('/api/v1/incidents').set(auth('verifier'));
    expect(incidents.status).toBe(200);
    const descriptions = (
      incidents.body.items as { description: string; verificationStatus: string }[]
    ).map((i) => i);
    expect(descriptions).toHaveLength(DEMO_REPORTS.length);
    for (const item of descriptions) {
      expect(item.description).toMatch(/^DEMO: /);
      expect(item.verificationStatus).toBe('REPORTED');
    }
    const help = await request(app).get('/api/v1/help-requests').set(auth('admin'));
    expect(help.status).toBe(200);
    expect(help.body.items).toHaveLength(1);
    expect(help.body.items[0]).toMatchObject({
      status: 'OPEN',
      source: 'SOS',
      category: 'MEDICAL',
    });
  });
});
