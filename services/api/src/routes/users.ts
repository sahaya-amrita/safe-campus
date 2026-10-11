import { Router } from 'express';
import { roleSchema, updateMeSchema } from '@sahaya/contracts';
import { writeAudit } from '../audit.js';
import { withTransaction, type DatabasePool } from '../db.js';
import { notFound } from '../errors.js';
import { validateBody } from '../middleware.js';

async function loadMe(pool: DatabasePool, id: string) {
  const result = await pool.query<{
    id: string;
    email: string;
    displayName: string;
    language: 'en' | 'ta';
    mode: 'DEMO' | 'DRILL' | 'TEST' | 'SIMULATION';
  }>(
    `SELECT id, email, display_name AS "displayName", language, mode
     FROM users WHERE id = $1`,
    [id],
  );
  const user = result.rows[0];
  if (!user) throw notFound('User');
  const roles = await pool.query<{ role: string }>(
    'SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role',
    [user.id],
  );
  return { ...user, roles: roleSchema.array().parse(roles.rows.map((row) => row.role)) };
}

export function usersRouter(pool: DatabasePool) {
  const router = Router();

  router.get('/me', async (request, response) => {
    response.json(await loadMe(pool, request.auth!.id));
  });

  /** A user may change only their own display name and language. Roles are never accepted here. */
  router.patch('/me', validateBody(updateMeSchema), async (request, response) => {
    const body = updateMeSchema.parse(request.body);
    const id = request.auth!.id;
    await withTransaction(pool, async (client) => {
      if (body.displayName !== undefined)
        await client.query('UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1', [
          id,
          body.displayName,
        ]);
      if (body.language !== undefined)
        await client.query('UPDATE users SET language = $2, updated_at = now() WHERE id = $1', [
          id,
          body.language,
        ]);
      await writeAudit(client, {
        actorId: id,
        action: 'USER_PROFILE_UPDATED',
        entityType: 'user',
        entityId: id,
        metadata: { fields: Object.keys(body) },
      });
    });
    response.json(await loadMe(pool, id));
  });

  /** Ends every session of this account, on every device. */
  router.post('/me/sign-out-everywhere', async (request, response) => {
    const id = request.auth!.id;
    await withTransaction(pool, async (client) => {
      await client.query('UPDATE users SET sessions_valid_after = $2 WHERE id = $1', [
        id,
        new Date(),
      ]);
      await writeAudit(client, {
        actorId: id,
        action: 'AUTH_SIGNED_OUT_EVERYWHERE',
        entityType: 'user',
        entityId: id,
      });
    });
    response.status(204).end();
  });

  return router;
}
