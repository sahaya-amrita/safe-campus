/**
 * Local development without PostgreSQL: runs the API on an in-memory
 * database (pg-mem) with every migration applied and fictional DEMO data:
 *
 * - accounts that sign in with their DEMO passwords (DEMO login is enabled
 *   here only; it is refused in production) or with an email code from the
 *   dev mailbox (GET /api/v1/dev/mailbox);
 * - one DEMO building with two floors and zones;
 * - a verified, available synthetic responder, so help requests are matched;
 * - DEMO guides, practice points and route network, and a drill alert.
 *
 * All data is lost when the process stops. Never use this for a deployment.
 *
 *   pnpm --filter @sahaya/api dev:memory
 */
import { randomBytes } from 'node:crypto';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import { withTransaction } from '../db.js';
import { seedDemoContent } from '../demo/demoContent.js';
import { hashPassword } from '../security.js';
import { createTestPool } from '../test-support/database.js';

const config = loadConfig({
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://in-memory/sahaya',
  JWT_SECRET: process.env.JWT_SECRET ?? randomBytes(32).toString('hex'),
  OPERATING_MODE: 'DEMO',
  DEMO_LOGIN_ENABLED: 'true',
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER ?? 'dev',
  AUTH_ALLOWED_EMAIL_DOMAINS: process.env.AUTH_ALLOWED_EMAIL_DOMAINS ?? 'campus.example',
  OUTBOX_POLL_MS: 0,
});

const pool = await createTestPool();

// Same fictional accounts and passwords as `pnpm db:seed` (public by design).
const accounts = [
  ['student.demo@example.invalid', 'Demo Student', 'DemoStudent!2026', ['STUDENT']],
  ['responder.demo@example.invalid', 'Demo Responder', 'DemoResponder!2026', ['RESPONDER']],
  ['verifier.demo@example.invalid', 'Demo Verifier', 'DemoVerifier!2026', ['INCIDENT_VERIFIER']],
  [
    'admin.demo@example.invalid',
    'Demo Administrator',
    'DemoAdmin!2026',
    ['ADMIN', 'DRILL_MANAGER'],
  ],
] as const;
const ids: Record<string, string> = {};
for (const [email, name, password, roles] of accounts) {
  const user = await pool.query<{ id: string }>(
    `INSERT INTO users (email, display_name, password_hash, mode, email_verified_at)
     VALUES ($1, $2, $3, 'DEMO', now()) RETURNING id`,
    [email, name, await hashPassword(password)],
  );
  ids[email] = user.rows[0]!.id;
  for (const role of roles)
    await pool.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [ids[email], role]);
}

const building = await pool.query<{ id: string }>(
  `INSERT INTO buildings (name, mode, geometry_version, geometry_approved)
   VALUES ('DEMO Building Alpha', 'DEMO', 'demo-v1', false) RETURNING id`,
);
let firstZone = '';
for (const [index, floorName] of ['Ground floor', 'First floor'].entries()) {
  const floor = await pool.query<{ id: string }>(
    `INSERT INTO floors (building_id, name, level_number) VALUES ($1, $2, $3) RETURNING id`,
    [building.rows[0]!.id, floorName, index],
  );
  const zone = await pool.query<{ id: string }>(
    `INSERT INTO zones (floor_id, name, zone_code, geometry_approved)
     VALUES ($1, $2, $3, false) RETURNING id`,
    [floor.rows[0]!.id, `DEMO ${floorName}`, `DEMO-A${index}`],
  );
  firstZone ||= zone.rows[0]!.id;
}
await pool.query(
  `INSERT INTO responders (user_id, approved_role, assigned_zone_id, availability, contact_channel,
     verified, mode)
   VALUES ($1, 'SYNTHETIC_RESPONDER', $2, 'AVAILABLE', 'IN_APP', true, 'DEMO')`,
  [ids['responder.demo@example.invalid'], firstZone],
);
await pool.query(
  `INSERT INTO zone_memberships (user_id, zone_id, source) VALUES ($1, $2, 'DEMO')`,
  [ids['student.demo@example.invalid'], firstZone],
);

await pool.query(
  `INSERT INTO drills (name, building_id, scenario_ref, scenario_version, mode, status, assumptions,
                       created_by)
   VALUES ('DEMO familiarisation drill', $1, 'demo-familiarisation', '1', 'SIMULATION', 'ACTIVE',
           '{"synthetic":true}'::jsonb, $2)`,
  [building.rows[0]!.id, ids['admin.demo@example.invalid']],
);
await withTransaction(pool, (client) =>
  seedDemoContent(client, {
    adminId: ids['admin.demo@example.invalid']!,
    verifierId: ids['verifier.demo@example.invalid']!,
    zoneId: firstZone,
  }),
);

createApp(pool, config).listen(config.PORT, () => {
  process.stdout.write(
    [
      `Amrita Sahaya API (IN-MEMORY, DEMO data, lost on exit) on http://127.0.0.1:${config.PORT}`,
      'DEMO password sign-in (development only):',
      ...accounts.map(([email, , password]) => `  ${email} / ${password}`),
      `Email codes: http://127.0.0.1:${config.PORT}/api/v1/dev/mailbox (new students: @${config.AUTH_ALLOWED_EMAIL_DOMAINS})`,
      '',
    ].join('\n'),
  );
});
