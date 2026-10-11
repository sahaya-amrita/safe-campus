import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@sahaya/contracts';
import { createApp } from './app.js';
import type { Config } from './config.js';
import type { DatabasePool } from './db.js';
import { purgeUnattachedPhotos } from './routes/adminOps.js';
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
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};
const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });

beforeEach(async () => {
  pool = await createTestPool();
  app = createApp(pool, config);
  zoneId = (await seedTestZone(pool)).zoneId;
  for (const [key, roles] of [
    ['admin', ['ADMIN']],
    ['verifier', ['INCIDENT_VERIFIER']],
    ['responder', ['RESPONDER']],
    ['responder2', ['RESPONDER']],
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
  for (const r of ['responder', 'responder2'])
    await pool.query(
      `INSERT INTO responders (user_id, approved_role, assigned_zone_id, availability, contact_channel, verified, mode)
       VALUES ($1, 'Synthetic', $2, 'AVAILABLE', 'IN_APP', true, 'TEST')`,
      [ids[r], zoneId],
    );
});
afterEach(async () => {
  if (pool) await pool.end();
});

const sos = () =>
  request(app)
    .post('/api/v1/sos')
    .set(auth('student'))
    .set('idempotency-key', `sos-${randomUUID()}`)
    .send({
      clientActionId: randomUUID(),
      clientCreatedAt: new Date().toISOString(),
      category: 'MEDICAL',
    });

describe('system settings', () => {
  it('uses documented defaults until an admin sets values with a source and reason', async () => {
    const initial = await request(app).get('/api/v1/settings').set(auth('responder'));
    expect(initial.body.values).toEqual({
      ackTargetSeconds: 120,
      escalateAfterSeconds: 300,
      maxMatchedResponders: 3,
      unattachedPhotoHours: 24,
    });
    expect(initial.body.meta.ackTargetSeconds).toBeNull();
    expect((await request(app).get('/api/v1/settings').set(auth('student'))).status).toBe(403);

    const bad = await request(app)
      .put('/api/v1/admin/settings')
      .set(auth('admin'))
      .send({ values: { escalateAfterSeconds: 100 }, source: 'ERT memo', reason: 'Testing order' });
    expect(bad.status).toBe(400);

    const saved = await request(app)
      .put('/api/v1/admin/settings')
      .set(auth('admin'))
      .send({
        values: { ackTargetSeconds: 90, maxMatchedResponders: 1 },
        source: 'ERT memo 2026-10-12',
        reason: 'Agreed timers',
      });
    expect(saved.status).toBe(200);
    expect(saved.body.values).toMatchObject({ ackTargetSeconds: 90, maxMatchedResponders: 1 });
    expect(saved.body.meta.ackTargetSeconds).toMatchObject({ source: 'ERT memo 2026-10-12' });
    expect(
      (
        await request(app)
          .put('/api/v1/admin/settings')
          .set(auth('responder'))
          .send({ values: { ackTargetSeconds: 60 }, source: 'Self', reason: 'Trying to change' })
      ).status,
    ).toBe(403);

    // Matching now notifies only one responder.
    await sos();
    expect((await pool.query('SELECT 1 FROM help_request_notifications')).rows).toHaveLength(1);
    const audit = await pool.query<{ metadata: { changes: Record<string, unknown> } }>(
      `SELECT metadata FROM audit_events WHERE action = 'SETTINGS_UPDATED'`,
    );
    expect(audit.rows[0]!.metadata.changes).toEqual({
      ackTargetSeconds: { from: 120, to: 90 },
      maxMatchedResponders: { from: 3, to: 1 },
    });
  });
});

describe('descriptive analytics', () => {
  it('counts reports and help requests, with acknowledgement times, for admins and verifiers only', async () => {
    const first = await sos();
    await sos();
    await request(app)
      .post(
        `/api/v1/help-requests/${(first.body as { helpRequest: { id: string } }).helpRequest.id}/acknowledge`,
      )
      // The SOS has no zone, so a zone-limited responder could not acknowledge it; an admin can.
      .set(auth('admin'))
      .set('idempotency-key', `ack-${randomUUID()}`);

    const analytics = await request(app)
      .get('/api/v1/admin/analytics?days=7')
      .set(auth('verifier'));
    expect(analytics.status).toBe(200);
    expect(analytics.body.window.days).toBe(7);
    expect(analytics.body.reports).toMatchObject({
      total: 2,
      byCategory: { MEDICAL: 2 },
      byKind: { SOS: 2 },
      byVerification: { REPORTED: 2 },
    });
    expect(analytics.body.helpRequests).toMatchObject({
      total: 2,
      bySource: { SOS: 2 },
      byStatus: { ACKNOWLEDGED: 1, OPEN: 1 },
      acknowledged: 1,
      ackTargetSeconds: 120,
    });
    expect(analytics.body.helpRequests.medianAckSeconds).toBeGreaterThanOrEqual(0);
    expect(analytics.body.dataNote).toMatch(/no prediction/);
    expect((await request(app).get('/api/v1/admin/analytics').set(auth('responder'))).status).toBe(
      403,
    );
  });
});

describe('photo retention', () => {
  it('deletes only unattached uploads older than the configured hours', async () => {
    const insert = async (status: string, hoursAgo: number) =>
      (
        await pool.query<{ id: string }>(
          `INSERT INTO attachments (owner_id, media_type, size_bytes, sha256, status, created_at)
           VALUES ($1, 'image/jpeg', 10, $2, $3, $4) RETURNING id`,
          [
            ids.student,
            randomUUID().replace(/-/g, '').padEnd(64, '0'),
            status,
            new Date(Date.now() - hoursAgo * 3_600_000),
          ],
        )
      ).rows[0]!.id;
    const old = await insert('STORED', 30);
    const fresh = await insert('STORED', 2);
    const attached = await insert('ATTACHED', 300);
    await pool.query(
      `INSERT INTO attachment_blobs (attachment_id, data_base64) VALUES ($1, 'AA==')`,
      [old],
    );
    expect(await purgeUnattachedPhotos(pool)).toBe(1);
    const left = (await pool.query<{ id: string }>('SELECT id FROM attachments')).rows.map(
      (r) => r.id,
    );
    expect(left.sort()).toEqual([fresh, attached].sort());
    expect((await pool.query('SELECT 1 FROM attachment_blobs')).rows).toHaveLength(0);
    expect(
      (await pool.query(`SELECT 1 FROM audit_events WHERE action = 'UNATTACHED_PHOTOS_PURGED'`))
        .rows,
    ).toHaveLength(1);
  });
});
