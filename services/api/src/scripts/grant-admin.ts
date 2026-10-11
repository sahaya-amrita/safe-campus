/**
 * Bootstraps the first ADMIN (or adds ADMIN to an existing account) from the
 * server, where only operators with database access can run it. After that,
 * admins grant roles in the app (audited). The account signs in with an
 * email code; no password is set.
 *
 *   pnpm --filter @sahaya/api admin:grant -- --email you@example.edu --name "Your Name" --reason "First administrator"
 */
import { parseArgs } from 'node:util';
import { adminReasonSchema, displayNameSchema, emailSchema } from '@sahaya/contracts';
import { writeAudit } from '../audit.js';
import { loadConfig } from '../config.js';
import { createPool, withTransaction } from '../db.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    reason: { type: 'string', default: 'Administrator bootstrapped from the server CLI' },
  },
});

const email = emailSchema.parse(values.email);
const reason = adminReasonSchema.parse(values.reason);
const config = loadConfig();
const pool = createPool(config);
try {
  const result = await withTransaction(pool, async (client) => {
    let user = (
      await client.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email])
    ).rows[0];
    let created = false;
    if (!user) {
      const name = displayNameSchema.parse(values.name ?? email.slice(0, email.indexOf('@')));
      user = (
        await client.query<{ id: string }>(
          `INSERT INTO users (email, display_name, password_hash, mode)
           VALUES ($1, $2, NULL, $3) RETURNING id`,
          [email, name, config.OPERATING_MODE],
        )
      ).rows[0]!;
      created = true;
    }
    const inserted = await client.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN') ON CONFLICT DO NOTHING`,
      [user.id],
    );
    if ((inserted.rowCount ?? 0) > 0)
      await writeAudit(client, {
        action: 'ROLE_GRANTED',
        entityType: 'user',
        entityId: user.id,
        metadata: { role: 'ADMIN', reason, via: 'server-cli', accountCreated: created },
      });
    return { id: user.id, created, granted: (inserted.rowCount ?? 0) > 0 };
  });
  process.stdout.write(
    `${result.granted ? 'Granted' : 'Already had'} ADMIN: ${email} (${result.id})${result.created ? ', account created' : ''}\n`,
  );
} finally {
  await pool.end();
}
