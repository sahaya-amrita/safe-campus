import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@sahaya/contracts';
import { createApp } from './app.js';
import { APP_KNOWLEDGE } from './assistant/content.js';
import type { Config } from './config.js';
import type { DatabasePool } from './db.js';
import { contentHash, reviewedKnowledge } from './routes/learning.js';
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
let buildingId: string;
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};
const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });

beforeEach(async () => {
  pool = await createTestPool();
  app = createApp(pool, config);
  buildingId = (await seedTestZone(pool)).buildingId;
  for (const [key, roles] of [
    ['manager', ['DRILL_MANAGER']],
    ['admin', ['ADMIN']],
    ['verifier', ['INCIDENT_VERIFIER']],
    ['responder', ['RESPONDER']],
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
});
afterEach(async () => {
  if (pool) await pool.end();
});

async function drill(status: string) {
  return (
    await pool.query<{ id: string }>(
      `INSERT INTO drills (name, building_id, scenario_ref, scenario_version, mode, status, created_by)
       VALUES ('Fire drill A', $1, 'S-1', 'v1', 'TEST', $2, $3) RETURNING id`,
      [buildingId, status, ids.manager],
    )
  ).rows[0]!.id;
}

const review = {
  summary: 'Evacuation took 6 minutes; one stairwell was crowded.',
  wentWell: 'Wardens were in place.',
  toImprove: 'Signage at stairwell B.',
  actions: [
    { id: 'a1', text: 'Add signage at stairwell B', owner: 'Estates', dueDate: '2026-11-01' },
  ],
};

describe('drill after-action review', () => {
  it('is saved only after the drill ends, marks it REVIEWED and is audited', async () => {
    const active = await drill('ACTIVE');
    const early = await request(app)
      .put(`/api/v1/drills/${active}/review`)
      .set(auth('manager'))
      .send(review);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('DRILL_NOT_ENDED');

    const ended = await drill('COMPLETED');
    const saved = await request(app)
      .put(`/api/v1/drills/${ended}/review`)
      .set(auth('manager'))
      .send(review);
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      summary: review.summary,
      updatedByName: 'manager',
      actions: [{ id: 'a1', status: 'OPEN', owner: 'Estates', dueDate: '2026-11-01' }],
    });
    const status = await pool.query<{ status: string }>('SELECT status FROM drills WHERE id = $1', [
      ended,
    ]);
    expect(status.rows[0]!.status).toBe('REVIEWED');

    // Updating keeps one review per drill.
    const updated = await request(app)
      .put(`/api/v1/drills/${ended}/review`)
      .set(auth('admin'))
      .send({ ...review, actions: [{ ...review.actions[0], status: 'DONE' }] });
    expect(updated.body.actions[0].status).toBe('DONE');
    expect((await pool.query('SELECT 1 FROM drill_reviews')).rows).toHaveLength(1);

    expect(
      (await request(app).get(`/api/v1/drills/${ended}/review`).set(auth('responder'))).status,
    ).toBe(200);
    expect(
      (await request(app).get(`/api/v1/drills/${ended}/review`).set(auth('student'))).status,
    ).toBe(403);
    expect(
      (await request(app).put(`/api/v1/drills/${ended}/review`).set(auth('responder')).send(review))
        .status,
    ).toBe(403);
    const audit = await pool.query(
      `SELECT 1 FROM audit_events WHERE action = 'DRILL_REVIEW_SAVED'`,
    );
    expect(audit.rows).toHaveLength(2);
  });
});

describe('student progress', () => {
  it('lists practice results and drills the student took part in', async () => {
    const drillId = await drill('ACTIVE');
    for (const status of ['HELP_REQUESTED', 'CONFIRMED_SAFE'])
      await request(app)
        .post('/api/v1/checkins')
        .set(auth('student'))
        .set('idempotency-key', `ci-${randomUUID()}`)
        .send({
          status,
          drillId,
          clientActionId: randomUUID(),
          clientCreatedAt: new Date().toISOString(),
        });
    await request(app)
      .post('/api/v1/training/results')
      .set(auth('student'))
      .set('idempotency-key', 'training-001')
      .send({ scenarioRef: 'fire-basics', scenarioVersion: 'v1', score: 80, answers: {} });

    const progress = await request(app).get('/api/v1/training/progress/mine').set(auth('student'));
    expect(progress.status).toBe(200);
    expect(progress.body.summary).toEqual({ practiceRuns: 1, bestScore: 80, drillsJoined: 1 });
    expect(progress.body.drills).toEqual([
      expect.objectContaining({ drillId, name: 'Fire drill A', lastStatus: 'CONFIRMED_SAFE' }),
    ]);
  });
});

describe('Tom help-content review', () => {
  const doc = APP_KNOWLEDGE[0]!;

  it('approves one exact text; edits or expiry return it to DRAFT', async () => {
    expect((await reviewedKnowledge(pool)).find((d) => d.id === doc.id)!.review.state).toBe(
      'DRAFT',
    );
    const approved = await request(app)
      .post(`/api/v1/admin/assistant-content/${doc.id}/review`)
      .set(auth('verifier'))
      .send({ decision: 'APPROVED', notes: 'Checked against the live screen' });
    expect(approved.status).toBe(201);

    const after = (await reviewedKnowledge(pool)).find((d) => d.id === doc.id)!;
    expect(after.review).toMatchObject({ state: 'APPROVED', reviewedBy: 'verifier' });

    // Same id, edited text: the approval no longer applies.
    const edited = [{ ...doc, body: `${doc.body} (edited)` }];
    expect((await reviewedKnowledge(pool, edited))[0]!.review.state).toBe('DRAFT');
    expect(contentHash(edited[0]!)).not.toBe(contentHash(doc));

    // Expired approval: DRAFT again.
    await request(app)
      .post(`/api/v1/admin/assistant-content/${doc.id}/review`)
      .set(auth('admin'))
      .send({ decision: 'APPROVED', notes: 'Short approval', validUntil: '2026-01-01T00:00:00Z' });
    expect((await reviewedKnowledge(pool, [doc], new Date('2026-06-01')))[0]!.review.state).toBe(
      'DRAFT',
    );

    const list = await request(app).get('/api/v1/admin/assistant-content').set(auth('admin'));
    expect(list.body.items.length).toBe(APP_KNOWLEDGE.length);
    expect(
      (await request(app).get('/api/v1/admin/assistant-content').set(auth('student'))).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/admin/assistant-content/no-such-doc/review')
          .set(auth('admin'))
          .send({ decision: 'APPROVED', notes: 'Not a real doc' })
      ).status,
    ).toBe(404);
  });
});
