/**
 * Local development without PostgreSQL: runs the API on an in-memory
 * database (pg-mem) with every migration applied and three synthetic
 * accounts. Sign-in codes go to the dev mailbox (GET /api/v1/dev/mailbox).
 * All data is lost when the process stops. Never use this for a deployment.
 *
 *   pnpm --filter @sahaya/api dev:memory
 */
import { randomBytes } from 'node:crypto';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createTestPool } from '../test-support/database.js';

const config = loadConfig({
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://in-memory/sahaya',
  JWT_SECRET: process.env.JWT_SECRET ?? randomBytes(32).toString('hex'),
  OPERATING_MODE: 'DEMO',
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER ?? 'dev',
  AUTH_ALLOWED_EMAIL_DOMAINS: process.env.AUTH_ALLOWED_EMAIL_DOMAINS ?? 'campus.example',
  OUTBOX_POLL_MS: 0,
});

const pool = await createTestPool();
const accounts = [
  ['student.demo@example.invalid', 'Demo Student', 'STUDENT'],
  ['responder.demo@example.invalid', 'Demo Responder', 'RESPONDER'],
  ['admin.demo@example.invalid', 'Demo Administrator', 'ADMIN'],
] as const;
for (const [email, name, role] of accounts) {
  const user = await pool.query<{ id: string }>(
    `INSERT INTO users (email, display_name, password_hash, mode, email_verified_at)
     VALUES ($1, $2, NULL, 'DEMO', now()) RETURNING id`,
    [email, name],
  );
  await pool.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [
    user.rows[0]!.id,
    role,
  ]);
}

createApp(pool, config).listen(config.PORT, () => {
  process.stdout.write(
    [
      `Amrita Sahaya API (IN-MEMORY, data is lost on exit) on http://127.0.0.1:${config.PORT}`,
      `Sign in with an email code: ${accounts.map(([email]) => email).join(', ')}`,
      `New students may register with @${config.AUTH_ALLOWED_EMAIL_DOMAINS}`,
      `Codes: http://127.0.0.1:${config.PORT}/api/v1/dev/mailbox`,
      '',
    ].join('\n'),
  );
});
