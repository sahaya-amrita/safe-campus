import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@sahaya/contracts';
import { createApp } from './app.js';
import type { Config } from './config.js';
import type { DatabasePool } from './db.js';
import {
  busiestWindow,
  computeInsights,
  forecastHelpRequests,
  median,
} from './insights/compute.js';
import {
  buildSummary,
  checkSummary,
  summaryFacts,
  templateSummary,
  type InsightsSummarizer,
} from './insights/summary.js';
import { syntheticHistory, type SyntheticEvent } from './insights/synthetic.js';
import { issueAccessToken } from './security.js';
import { createTestPool, seedTestIdentity } from './test-support/database.js';

const ASOF = new Date('2026-10-11T12:00:00Z');
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

describe('synthetic history and statistics', () => {
  it('is the same for the same day and covers 90 days', () => {
    const a = syntheticHistory(ASOF);
    const b = syntheticHistory(new Date('2026-10-11T23:00:00Z'));
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(300);
    const first = a[0]!.at.getTime();
    const last = a[a.length - 1]!.at.getTime();
    expect(first).toBeGreaterThanOrEqual(Date.parse('2026-07-13T00:00:00Z'));
    expect(last).toBeLessThan(Date.parse('2026-10-11T00:00:00Z'));
  });

  it('finds the built-in patterns: rising hazards, and wet-floor hotspots at the hostel and Block 1', () => {
    const r = computeInsights(syntheticHistory(ASOF), 'student', ['student'], ASOF);
    const hazard = r.trends.find((t) => t.category === 'HAZARD')!;
    expect(hazard.changePercent).toBeGreaterThan(25);
    const places = r.hotspots.filter((h) => h.category === 'HAZARD').map((h) => h.place);
    expect(places.some((p) => /Hostel Delta|Academic Block 1/.test(p))).toBe(true);
    for (const p of r.precautions) {
      expect(p.pattern).toMatch(/\(synthetic data\)\.$/);
      expect(p.guideVersion).toMatch(/^demo-/);
    }
  });

  it('gives students no workload or verification figures', () => {
    const r = computeInsights(syntheticHistory(ASOF), 'student', ['student'], ASOF);
    expect(r.forecast).toBeUndefined();
    expect(r.acknowledgement).toBeUndefined();
    expect(r.verification).toBeUndefined();
    expect(JSON.stringify(r)).not.toMatch(/@|student\.demo|reporter/);
  });

  it('computes the forecast as a same-weekday average with a 90% range', () => {
    const day = (iso: string, n: number): SyntheticEvent[] =>
      Array.from({ length: n }, () => ({
        at: new Date(iso),
        category: 'MEDICAL',
        place: 'X',
        helpRequest: true,
        ackSeconds: 60,
        outcome: 'VERIFIED',
      }));
    // Four help requests on each of the 8 previous Sundays.
    const events = Array.from({ length: 8 }, (_, w) =>
      day(new Date(Date.parse('2026-10-11T10:00:00Z') - (w + 1) * 7 * 86_400_000).toISOString(), 4),
    ).flat();
    const sunday = forecastHelpRequests(events, ASOF)[0]!;
    expect(sunday).toMatchObject({ weekday: 'Sunday', expected: 4, low: 0, high: 8 });
    expect(median([5, 1, 3])).toBe(3);
    expect(busiestWindow([...Array(22).fill(0), 5, 5])).toBe(21);
  });
});

describe('AI summary checks', () => {
  const insights = computeInsights(syntheticHistory(ASOF), 'admin', ['admin'], ASOF);
  const facts = summaryFacts(insights);

  it('accepts a summary that only restates the facts', () => {
    const t = insights.trends[0]!;
    expect(
      checkSummary(
        `This synthetic data shows ${insights.totals.reports} reports in the last 30 days; ${t.label} was most common with ${t.last30}.`,
        facts,
      ),
    ).toBeNull();
  });

  it('rejects invented numbers, missing synthetic labels and certainty', () => {
    expect(
      checkSummary('This synthetic data shows 987654 reports in the last 30 days overall.', facts),
    ).toMatch(/numbers not in the facts/);
    expect(
      checkSummary(
        `There were ${insights.totals.reports} reports in the last 30 days overall.`,
        facts,
      ),
    ).toMatch(/synthetic/);
    expect(
      checkSummary(
        'This synthetic data guarantees the campus is completely safe for everyone.',
        facts,
      ),
    ).toMatch(/certainty/);
  });

  it('falls back to the app summary when AI is off, fails or is rejected', async () => {
    const off = await buildSummary(insights, null, ASOF);
    expect(off).toMatchObject({ source: 'APP', model: null });
    expect(off.text).toBe(templateSummary(insights));

    const liar: InsightsSummarizer = {
      model: 'test-model',
      summarize: async () => 'This synthetic data shows 31337 incidents and a big rise next week.',
    };
    const rejected = await buildSummary(insights, liar, ASOF);
    expect(rejected.source).toBe('APP');
    expect(rejected.fallbackReason).toMatch(/numbers not in the facts/);

    const honest: InsightsSummarizer = {
      model: 'test-model',
      summarize: async () =>
        `In this synthetic data there were ${insights.totals.reports} reports in the last 30 days, mostly ${insights.busiestWindow}.`,
    };
    const ok = await buildSummary(insights, honest, ASOF);
    expect(ok).toMatchObject({ source: 'AI', model: 'test-model', fallbackReason: null });
  });
});

describe('insights API', () => {
  let pool: DatabasePool;
  const tokens: Record<string, string> = {};
  beforeEach(async () => {
    pool = await createTestPool();
    for (const [key, roles] of [
      ['student', ['STUDENT']],
      ['responder', ['RESPONDER']],
      ['verifier', ['INCIDENT_VERIFIER']],
      ['admin', ['ADMIN']],
    ] as [string, Role[]][]) {
      const id = await seedTestIdentity(pool, {
        email: `${key}@test.invalid`,
        displayName: key,
        roles,
      });
      tokens[key] = await issueAccessToken(config, { id, email: `${key}@test.invalid`, roles });
    }
  });
  afterEach(async () => {
    if (pool) await pool.end();
  });
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });

  it('gives each role its own default view and refuses views it may not open', async () => {
    const app = createApp(pool, config, { insights: { summarizer: null, now: () => ASOF } });
    const expectView = async (who: string, view: string, available: string[]) => {
      const r = await request(app).get('/api/v1/insights').set(auth(who));
      expect(r.status).toBe(200);
      expect(r.body.view).toBe(view);
      expect(r.body.availableViews).toEqual(available);
    };
    await expectView('student', 'student', ['student']);
    await expectView('responder', 'responder', ['student', 'responder']);
    await expectView('verifier', 'verifier', ['student', 'verifier']);
    await expectView('admin', 'admin', ['student', 'responder', 'verifier', 'admin']);
    expect(
      (await request(app).get('/api/v1/insights?view=admin').set(auth('student'))).status,
    ).toBe(403);
    expect((await request(app).get('/api/v1/insights')).status).toBe(401);
  });

  it('serves a cached summary per view and day, and is unavailable outside DEMO', async () => {
    const summarize = vi.fn<() => Promise<string | null>>(async () => null);
    const app = createApp(pool, config, {
      insights: { summarizer: { model: 'm', summarize }, now: () => ASOF },
    });
    const first = await request(app).get('/api/v1/insights/summary').set(auth('student'));
    expect(first.body).toMatchObject({ view: 'student', source: 'APP' });
    expect(first.body.fallbackReason).toMatch(/did not answer/);
    // A failed AI call is not cached: the next request tries again.
    const facts = first.body.text as string;
    summarize.mockResolvedValue(`Synthetic data only. ${facts}`);
    const second = await request(app).get('/api/v1/insights/summary').set(auth('student'));
    expect(second.body.source).toBe('AI');
    // An AI summary is cached for the day.
    await request(app).get('/api/v1/insights/summary').set(auth('student'));
    expect(summarize).toHaveBeenCalledTimes(2);

    const live = createApp(
      pool,
      { ...config, OPERATING_MODE: 'DRILL' },
      {
        insights: { summarizer: null, now: () => ASOF },
      },
    );
    expect((await request(live).get('/api/v1/insights').set(auth('admin'))).status).toBe(404);
  });
});
