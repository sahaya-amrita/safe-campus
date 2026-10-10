import { Router } from 'express';
import { roleSchema } from '@sahaya/contracts';
import type { DatabasePool } from '../db.js';
import { notFound } from '../errors.js';

export function usersRouter(pool: DatabasePool) {
  const router = Router();

  router.get('/me', async (request, response) => {
    const result = await pool.query<{
      id: string;
      email: string;
      displayName: string;
      language: 'en' | 'ta';
      mode: 'DEMO' | 'DRILL' | 'TEST' | 'SIMULATION';
    }>(
      `SELECT id, email, display_name AS "displayName", language, mode
       FROM users WHERE id = $1`,
      [request.auth!.id],
    );
    const user = result.rows[0];
    if (!user) throw notFound('User');
    const roles = await pool.query<{ role: string }>(
      'SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role',
      [user.id],
    );
    response.json({ ...user, roles: roleSchema.array().parse(roles.rows.map((row) => row.role)) });
  });

  return router;
}
