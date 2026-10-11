import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@sahaya/contracts';
import { createApp } from './app.js';
import { DevMailbox, ResendSender } from './auth/email.js';
import { authSettings, loadConfig, type Config } from './config.js';
import type { DatabasePool } from './db.js';
import { issueAccessToken } from './security.js';
import { createTestPool, seedTestIdentity } from './test-support/database.js';

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
  AUTH_ALLOWED_EMAIL_DOMAINS: 'campus.test, @students.campus.test',
  EMAIL_PROVIDER: 'dev',
};

let pool: DatabasePool;
let mailbox: DevMailbox;
let app: ReturnType<typeof createApp>;

function lastCode(to: string): string {
  const message = mailbox.messages().find((m) => m.to === to);
  const code = message?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`No code emailed to ${to}`);
  return code;
}

/** Moves recent challenges back in time so the resend wait does not apply. */
async function ageChallenges(email: string, seconds = 120) {
  await pool.query(
    `UPDATE auth_otp_challenges SET created_at = created_at - ($2 || ' seconds')::interval
     WHERE email = $1`,
    [email, String(seconds)],
  );
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

beforeEach(async () => {
  pool = await createTestPool();
  mailbox = new DevMailbox();
  app = createApp(pool, config, { emailSender: mailbox });
});

afterEach(async () => {
  if (pool) await pool.end();
});

describe('configuration', () => {
  it('describes sign-in methods without exposing DEMO login by default', async () => {
    const response = await request(app).get('/api/v1/auth/config');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      methods: ['EMAIL_OTP'],
      allowedEmailDomains: ['campus.test', 'students.campus.test'],
      emailDelivery: true,
      codeLength: 6,
      codeTtlSeconds: 600,
      resendAfterSeconds: 60,
    });
    const demo = await request(app)
      .post('/api/v1/auth/demo-login')
      .send({ email: 'a@campus.test', password: 'whatever-password' });
    expect(demo.status).toBe(404);
  });

  it('never allows DEMO login or the dev mailbox in production', () => {
    const base = { ...config, NODE_ENV: 'production' } as Record<string, unknown>;
    expect(() => loadConfig({ ...base, DEMO_LOGIN_ENABLED: 'true' })).toThrow(/DEMO password/);
    expect(() => loadConfig({ ...base, EMAIL_PROVIDER: 'dev' })).toThrow(/dev mailbox/);
    expect(
      authSettings({ ...config, NODE_ENV: 'production', DEMO_LOGIN_ENABLED: true }),
    ).toMatchObject({ demoLoginEnabled: false });
    const prodApp = createApp(
      pool,
      { ...config, NODE_ENV: 'production' },
      { emailSender: mailbox },
    );
    return request(prodApp)
      .get('/api/v1/dev/mailbox')
      .then((r) => expect(r.status).not.toBe(200));
  });

  it('reports when no email sender is configured', async () => {
    const noMail = createApp(pool, config, { emailSender: null });
    const response = await request(noMail)
      .post('/api/v1/auth/otp/request')
      .send({ email: 'new@campus.test' });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('EMAIL_DELIVERY_UNAVAILABLE');
  });
});

describe('email one-time-code sign-in', () => {
  it('registers an allow-listed address as a STUDENT only', async () => {
    const requested = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ email: '  New.Student@Campus.TEST ' });
    expect(requested.status).toBe(202);
    expect(requested.body.status).toBe('CODE_SENT_IF_ELIGIBLE');

    const code = lastCode('new.student@campus.test');
    const verified = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ email: 'new.student@campus.test', code, displayName: 'New Student' });
    expect(verified.status).toBe(201);
    expect(verified.body.user).toMatchObject({
      email: 'new.student@campus.test',
      displayName: 'New Student',
      roles: ['STUDENT'],
      mode: 'TEST',
    });

    const token = (verified.body as { accessToken: string }).accessToken;
    const me = await request(app).get('/api/v1/users/me').set(bearer(token));
    expect(me.status).toBe(200);
    expect(me.body.roles).toEqual(['STUDENT']);

    // The code works once.
    const again = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ email: 'new.student@campus.test', code });
    expect(again.status).toBe(400);
  });

  it('answers the same for unknown, non-allow-listed addresses and emails nothing', async () => {
    const response = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ email: 'someone@elsewhere.test' });
    expect(response.status).toBe(202);
    expect(response.body.status).toBe('CODE_SENT_IF_ELIGIBLE');
    expect(mailbox.messages()).toHaveLength(0);

    const guess = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ email: 'someone@elsewhere.test', code: '123456' });
    expect(guess.status).toBe(400);
    const users = await pool.query('SELECT 1 FROM users WHERE email = $1', [
      'someone@elsewhere.test',
    ]);
    expect(users.rows).toHaveLength(0);
  });

  it('signs in an existing account from any domain without changing its roles', async () => {
    const id = await seedTestIdentity(pool, {
      email: 'responder@partner.test',
      displayName: 'Synthetic Responder',
      roles: ['RESPONDER'],
    });
    await request(app).post('/api/v1/auth/otp/request').send({ email: 'responder@partner.test' });
    const verified = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ email: 'responder@partner.test', code: lastCode('responder@partner.test') });
    expect(verified.status).toBe(200);
    expect(verified.body.created).toBe(false);
    expect(verified.body.user).toMatchObject({ id, roles: ['RESPONDER'] });
  });

  it('stores only a hash of the code and never audits the code', async () => {
    await request(app).post('/api/v1/auth/otp/request').send({ email: 'hash@campus.test' });
    const code = lastCode('hash@campus.test');
    const stored = await pool.query<{ code_hash: string }>(
      'SELECT code_hash FROM auth_otp_challenges WHERE email = $1',
      ['hash@campus.test'],
    );
    expect(stored.rows[0]!.code_hash).not.toContain(code);
    expect(stored.rows[0]!.code_hash).toMatch(/^[0-9a-f]{64}$/);
    const audit = await pool.query<{ metadata: unknown }>('SELECT metadata FROM audit_events');
    expect(JSON.stringify(audit.rows)).not.toContain(code);
  });

  it('locks a code after five wrong attempts', async () => {
    await request(app).post('/api/v1/auth/otp/request').send({ email: 'lock@campus.test' });
    const code = lastCode('lock@campus.test');
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const attempt = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ email: 'lock@campus.test', code: wrong });
      expect(attempt.status).toBe(400);
    }
    const right = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ email: 'lock@campus.test', code });
    expect(right.status).toBe(400);
    const locked = await pool.query(`SELECT 1 FROM audit_events WHERE action = 'AUTH_OTP_LOCKED'`);
    expect(locked.rows).toHaveLength(1);
  });

  it('rejects expired codes', async () => {
    await request(app).post('/api/v1/auth/otp/request').send({ email: 'late@campus.test' });
    await pool.query(
      `UPDATE auth_otp_challenges SET expires_at = now() - interval '1 second' WHERE email = $1`,
      ['late@campus.test'],
    );
    const response = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ email: 'late@campus.test', code: lastCode('late@campus.test') });
    expect(response.status).toBe(400);
  });

  it('limits resends, and a new code replaces the old one', async () => {
    await request(app).post('/api/v1/auth/otp/request').send({ email: 'again@campus.test' });
    const first = lastCode('again@campus.test');
    const tooSoon = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ email: 'again@campus.test' });
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.error.code).toBe('OTP_RESEND_TOO_SOON');

    await ageChallenges('again@campus.test');
    await request(app).post('/api/v1/auth/otp/request').send({ email: 'again@campus.test' });
    const second = lastCode('again@campus.test');
    if (first !== second) {
      const old = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ email: 'again@campus.test', code: first });
      expect(old.status).toBe(400);
    }
    const fresh = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ email: 'again@campus.test', code: second });
    expect(fresh.status).toBe(201);
  });

  it('caps codes per hour for an address', async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await request(app)
        .post('/api/v1/auth/otp/request')
        .send({ email: 'busy@campus.test' });
      expect(ok.status).toBe(202);
      await ageChallenges('busy@campus.test', 61);
    }
    const capped = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ email: 'busy@campus.test' });
    expect(capped.status).toBe(429);
    expect(capped.body.error.code).toBe('OTP_RATE_LIMITED');
  });

  it('refuses disabled accounts and emails them nothing', async () => {
    await seedTestIdentity(pool, {
      email: 'gone@campus.test',
      displayName: 'Disabled',
      roles: ['STUDENT'],
    });
    await pool.query(`UPDATE users SET status = 'DISABLED' WHERE email = $1`, ['gone@campus.test']);
    const response = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ email: 'gone@campus.test' });
    expect(response.status).toBe(202);
    expect(mailbox.messages()).toHaveLength(0);
  });
});

describe('sessions and roles', () => {
  async function tokenFor(id: string, email: string, roles: Role[]) {
    return issueAccessToken(config, { id, email, roles });
  }

  it('signs out everywhere: older tokens stop working', async () => {
    const id = await seedTestIdentity(pool, {
      email: 's@campus.test',
      displayName: 'S',
      roles: ['STUDENT'],
    });
    const token = await tokenFor(id, 's@campus.test', ['STUDENT']);
    const out = await request(app).post('/api/v1/users/me/sign-out-everywhere').set(bearer(token));
    expect(out.status).toBe(204);
    const after = await request(app).get('/api/v1/users/me').set(bearer(token));
    expect(after.status).toBe(401);
    await new Promise((r) => setTimeout(r, 5));
    const fresh = await tokenFor(id, 's@campus.test', ['STUDENT']);
    expect((await request(app).get('/api/v1/users/me').set(bearer(fresh))).status).toBe(200);
  });

  it('takes roles from the database, not from the token', async () => {
    const id = await seedTestIdentity(pool, {
      email: 'x@campus.test',
      displayName: 'X',
      roles: ['STUDENT'],
    });
    // A token claiming ADMIN does not make the account an admin.
    const forged = await tokenFor(id, 'x@campus.test', ['ADMIN']);
    const response = await request(app).get('/api/v1/admin/users').set(bearer(forged));
    expect(response.status).toBe(403);
  });

  it('lets users edit their name and language but never their roles', async () => {
    const id = await seedTestIdentity(pool, {
      email: 'p@campus.test',
      displayName: 'Before',
      roles: ['STUDENT'],
    });
    const token = await tokenFor(id, 'p@campus.test', ['STUDENT']);
    const response = await request(app)
      .patch('/api/v1/users/me')
      .set(bearer(token))
      .send({ displayName: 'After Name', language: 'ta', roles: ['ADMIN'] });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      displayName: 'After Name',
      language: 'ta',
      roles: ['STUDENT'],
    });
  });
});

describe('ADMIN user and audit management', () => {
  let adminId: string;
  let adminToken: string;
  let studentId: string;
  let studentToken: string;

  beforeEach(async () => {
    adminId = await seedTestIdentity(pool, {
      email: 'admin@campus.test',
      displayName: 'Admin',
      roles: ['ADMIN'],
    });
    studentId = await seedTestIdentity(pool, {
      email: 'student@campus.test',
      displayName: 'Student',
      roles: ['STUDENT'],
    });
    adminToken = await issueAccessToken(config, {
      id: adminId,
      email: 'admin@campus.test',
      roles: ['ADMIN'],
    });
    studentToken = await issueAccessToken(config, {
      id: studentId,
      email: 'student@campus.test',
      roles: ['STUDENT'],
    });
  });

  it('is closed to non-admins', async () => {
    for (const path of ['/api/v1/admin/users', '/api/v1/admin/audit-events']) {
      expect((await request(app).get(path).set(bearer(studentToken))).status).toBe(403);
      expect((await request(app).get(path)).status).toBe(401);
    }
    const grant = await request(app)
      .post(`/api/v1/admin/users/${studentId}/roles`)
      .set(bearer(studentToken))
      .send({ role: 'ADMIN', reason: 'self promotion attempt' });
    expect(grant.status).toBe(403);
  });

  it('lists and searches accounts', async () => {
    const all = await request(app).get('/api/v1/admin/users').set(bearer(adminToken));
    expect(all.status).toBe(200);
    expect(all.body.items.map((u: { email: string }) => u.email).sort()).toEqual([
      'admin@campus.test',
      'student@campus.test',
    ]);
    const found = await request(app)
      .get('/api/v1/admin/users?q=STUDENT&role=STUDENT')
      .set(bearer(adminToken));
    expect(found.body.items).toHaveLength(1);
    expect(found.body.items[0]).toMatchObject({
      id: studentId,
      status: 'ACTIVE',
      roles: ['STUDENT'],
    });
    const page = await request(app).get('/api/v1/admin/users?limit=1').set(bearer(adminToken));
    expect(page.body.items).toHaveLength(1);
    expect(page.body.nextCursor).toEqual(expect.any(String));
  });

  it('grants and revokes roles with a reason, audited, effective immediately', async () => {
    const missingReason = await request(app)
      .post(`/api/v1/admin/users/${studentId}/roles`)
      .set(bearer(adminToken))
      .send({ role: 'RESPONDER' });
    expect(missingReason.status).toBe(400);

    const grant = await request(app)
      .post(`/api/v1/admin/users/${studentId}/roles`)
      .set(bearer(adminToken))
      .send({ role: 'RESPONDER', reason: 'Synthetic responder for drills' });
    expect(grant.status).toBe(200);
    expect(grant.body).toEqual({ changed: true, roles: ['RESPONDER', 'STUDENT'] });
    // The student's existing token now carries the new role.
    expect((await request(app).get('/api/v1/dispatches').set(bearer(studentToken))).status).toBe(
      200,
    );

    const revoke = await request(app)
      .post(`/api/v1/admin/users/${studentId}/roles/RESPONDER/revoke`)
      .set(bearer(adminToken))
      .send({ reason: 'Drill finished' });
    expect(revoke.body).toEqual({ changed: true, roles: ['STUDENT'] });
    expect((await request(app).get('/api/v1/dispatches').set(bearer(studentToken))).status).toBe(
      403,
    );

    const audit = await request(app)
      .get('/api/v1/admin/audit-events?entityType=user')
      .set(bearer(adminToken));
    const actions = audit.body.items.map((e: { action: string }) => e.action);
    expect(actions).toEqual(['ROLE_REVOKED', 'ROLE_GRANTED']);
    expect(audit.body.items[1]).toMatchObject({
      actorId: adminId,
      actorEmail: 'admin@campus.test',
      entityId: studentId,
      metadata: { role: 'RESPONDER', reason: 'Synthetic responder for drills' },
    });
  });

  it('protects the last admin and the acting admin', async () => {
    const selfRevoke = await request(app)
      .post(`/api/v1/admin/users/${adminId}/roles/ADMIN/revoke`)
      .set(bearer(adminToken))
      .send({ reason: 'Trying to lock everyone out' });
    expect(selfRevoke.status).toBe(409);
    const selfDisable = await request(app)
      .post(`/api/v1/admin/users/${adminId}/status`)
      .set(bearer(adminToken))
      .send({ status: 'DISABLED', reason: 'Trying to lock everyone out' });
    expect(selfDisable.status).toBe(409);
  });

  it('disables an account and ends its sessions', async () => {
    const disable = await request(app)
      .post(`/api/v1/admin/users/${studentId}/status`)
      .set(bearer(adminToken))
      .send({ status: 'DISABLED', reason: 'Reported lost phone' });
    expect(disable.body).toEqual({ changed: true, status: 'DISABLED' });
    expect((await request(app).get('/api/v1/users/me').set(bearer(studentToken))).status).toBe(401);
    const enable = await request(app)
      .post(`/api/v1/admin/users/${studentId}/status`)
      .set(bearer(adminToken))
      .send({ status: 'ACTIVE', reason: 'Phone recovered' });
    expect(enable.body).toEqual({ changed: true, status: 'ACTIVE' });
    // The old token stays revoked; the student signs in again.
    expect((await request(app).get('/api/v1/users/me').set(bearer(studentToken))).status).toBe(401);
  });

  it('pages audit events newest first', async () => {
    for (const reason of ['first change', 'second change', 'third change']) {
      await request(app)
        .post(`/api/v1/admin/users/${studentId}/status`)
        .set(bearer(adminToken))
        .send({ status: reason === 'second change' ? 'ACTIVE' : 'DISABLED', reason });
    }
    const first = await request(app)
      .get('/api/v1/admin/audit-events?limit=2')
      .set(bearer(adminToken));
    type AuditPage = { items: { id: number }[]; nextBefore: number | null };
    const firstPage = first.body as AuditPage;
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.items[0]!.id).toBeGreaterThan(firstPage.items[1]!.id);
    const next = await request(app)
      .get(`/api/v1/admin/audit-events?limit=2&before=${firstPage.nextBefore}`)
      .set(bearer(adminToken));
    expect((next.body as AuditPage).items[0]!.id).toBeLessThan(firstPage.items[1]!.id);
  });
});

describe('Resend sender', () => {
  it('posts the message to the provider and surfaces failures', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = new ResendSender(
      're_test_key_000',
      'Sahaya <no-reply@campus.test>',
      async (url, init) => {
        calls.push({ url: url as string, init: init! });
        return new Response('{}', { status: 200 });
      },
    );
    await ok.send({ to: 'a@campus.test', subject: 'Code', text: 'Your code is 123456.' });
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer re_test_key_000',
    );
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({ to: ['a@campus.test'] });

    const failing = new ResendSender(
      're_test_key_000',
      'x@campus.test',
      async () => new Response('nope', { status: 422 }),
    );
    await expect(failing.send({ to: 'a@campus.test', subject: 's', text: 't' })).rejects.toThrow(
      /422/,
    );
  });
});
