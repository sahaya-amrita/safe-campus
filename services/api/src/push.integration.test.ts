import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@sahaya/contracts';
import { createApp } from './app.js';
import { loadConfig, type Config } from './config.js';
import type { DatabasePool } from './db.js';
import { createLogger } from './logger.js';
import { isAllowedPushEndpoint, type PushSender } from './notifications/push.js';
import { processOutboxBatch } from './outbox.js';
import { issueAccessToken } from './security.js';
import { createTestPool, seedTestIdentity } from './test-support/database.js';

const base: Config = {
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
const withPush: Config = {
  ...base,
  PUSH_PROVIDER: 'webpush',
  VAPID_PUBLIC_KEY: 'B'.repeat(87),
  VAPID_PRIVATE_KEY: 'p'.repeat(43),
  VAPID_SUBJECT: 'mailto:team@example.invalid',
};
const FCM = 'https://fcm.googleapis.com/fcm/send/device-token-1';
const KEYS = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };

let pool: DatabasePool;
const tokens: Record<string, string> = {};
const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });

beforeEach(async () => {
  pool = await createTestPool();
  for (const [key, roles] of [
    ['responder', ['RESPONDER']],
    ['student', ['STUDENT']],
  ] as [string, Role[]][]) {
    const id = await seedTestIdentity(pool, {
      email: `${key}@test.invalid`,
      displayName: key,
      roles,
    });
    tokens[key] = await issueAccessToken(base, { id, email: `${key}@test.invalid`, roles });
    if (key === 'responder')
      await pool.query(
        `INSERT INTO responders (user_id, approved_role, availability, contact_channel, verified, mode)
         VALUES ($1, 'Synthetic', 'AVAILABLE', 'IN_APP', true, 'DEMO')`,
        [id],
      );
  }
});
afterEach(async () => {
  if (pool) await pool.end();
});

describe('push configuration', () => {
  it('is off without VAPID keys and refuses half-configured settings', async () => {
    const app = createApp(pool, base);
    const view = await request(app).get('/api/v1/push/config').set(auth('responder'));
    expect(view.body).toMatchObject({ enabled: false, publicKey: null, devices: 0 });
    expect(view.body.note).toMatch(/in-app inbox/);
    const refused = await request(app)
      .post('/api/v1/push/subscriptions')
      .set(auth('responder'))
      .send({ endpoint: FCM, keys: KEYS });
    expect(refused.status).toBe(409);
    expect(() =>
      loadConfig({ ...base, PUSH_PROVIDER: 'webpush' } as Record<string, unknown>),
    ).toThrow(/VAPID/);
  });

  it('accepts only the browser push services', () => {
    expect(isAllowedPushEndpoint(FCM)).toBe(true);
    expect(isAllowedPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(
      true,
    );
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.example/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://169.254.169.254/latest')).toBe(false);
    expect(isAllowedPushEndpoint('not a url')).toBe(false);
  });
});

describe('push delivery', () => {
  it('registers responder devices and sends a detail-free notice when a request is matched', async () => {
    const app = createApp(pool, withPush);
    expect(
      (
        await request(app)
          .post('/api/v1/push/subscriptions')
          .set(auth('student'))
          .send({ endpoint: FCM, keys: KEYS })
      ).status,
    ).toBe(403);
    const evil = await request(app)
      .post('/api/v1/push/subscriptions')
      .set(auth('responder'))
      .send({ endpoint: 'https://attacker.example/collect', keys: KEYS });
    expect(evil.status).toBe(400);
    expect(evil.body.error.code).toBe('PUSH_ENDPOINT_NOT_ALLOWED');

    const saved = await request(app)
      .post('/api/v1/push/subscriptions')
      .set(auth('responder'))
      .send({ endpoint: FCM, keys: KEYS });
    expect(saved.status).toBe(201);
    expect(saved.body.devices).toBe(1);
    const audit = await pool.query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit_events WHERE action = 'PUSH_DEVICE_REGISTERED'`,
    );
    expect(audit.rows[0]!.metadata).toEqual({ pushHost: 'fcm.googleapis.com' });

    const sos = await request(app)
      .post('/api/v1/sos')
      .set(auth('student'))
      .set('idempotency-key', `sos-${randomUUID()}`)
      .send({
        clientActionId: randomUUID(),
        clientCreatedAt: new Date().toISOString(),
        category: 'MEDICAL',
        message: 'Private details that must not be pushed',
      });
    expect(sos.status).toBe(201);

    const sender = vi.fn<PushSender>(async () => ({ ok: true }));
    await processOutboxBatch(pool, withPush, createLogger(withPush), false, sender);
    expect(sender).toHaveBeenCalledTimes(1);
    const [subscription, payload] = sender.mock.calls[0]!;
    expect(subscription).toEqual({ endpoint: FCM, ...KEYS });
    expect(payload).toMatchObject({
      title: 'DEMO: help request matched to you',
      body: 'Open Amrita Sahaya to review and acknowledge it.',
      url: '/#/responder/help',
    });
    expect(JSON.stringify(payload)).not.toMatch(/Private|MEDICAL|student/);
    const record = await pool.query<{ push_devices: number; channel: string }>(
      'SELECT push_devices, channel FROM help_request_notifications',
    );
    expect(record.rows[0]).toMatchObject({ push_devices: 1, channel: 'SIMULATED' });
  });

  it('revokes devices the push service reports as gone, and lets responders remove devices', async () => {
    const app = createApp(pool, withPush);
    await request(app)
      .post('/api/v1/push/subscriptions')
      .set(auth('responder'))
      .send({ endpoint: FCM, keys: KEYS });
    await request(app)
      .post('/api/v1/sos')
      .set(auth('student'))
      .set('idempotency-key', `sos-${randomUUID()}`)
      .send({
        clientActionId: randomUUID(),
        clientCreatedAt: new Date().toISOString(),
        category: 'FIRE_SMOKE',
      });
    const gone: PushSender = async () => ({ ok: false, gone: true, error: 'Gone' });
    await processOutboxBatch(pool, withPush, createLogger(withPush), false, gone);
    const after = await request(app).get('/api/v1/push/config').set(auth('responder'));
    expect(after.body.devices).toBe(0);
    expect(
      (
        await pool.query<{ push_devices: number }>(
          'SELECT push_devices FROM help_request_notifications',
        )
      ).rows[0]!.push_devices,
    ).toBe(0);

    const second = 'https://fcm.googleapis.com/fcm/send/device-token-2';
    await request(app)
      .post('/api/v1/push/subscriptions')
      .set(auth('responder'))
      .send({ endpoint: second, keys: KEYS });
    const removed = await request(app)
      .post('/api/v1/push/subscriptions/remove')
      .set(auth('responder'))
      .send({ endpoint: second });
    expect(removed.body.devices).toBe(0);
  });
});
