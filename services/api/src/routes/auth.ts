import { Router } from 'express';
import { z } from 'zod';
import { roleSchema } from '@sahaya/contracts';
import type { Config } from '../config.js';
import type { DatabasePool } from '../db.js';
import { unauthorized } from '../errors.js';
import { validateBody } from '../middleware.js';
import { issueAccessToken, verifyPassword } from '../security.js';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });

export function authRouter(pool: DatabasePool, config: Config) {
  const router = Router();
  router.post('/demo-login', validateBody(loginSchema), async (request, response) => {
    const body = loginSchema.parse(request.body);
    const result = await pool.query<{
      id: string;
      email: string;
      display_name: string;
      password_hash: string;
      language: 'en' | 'ta';
      mode: 'DEMO' | 'DRILL' | 'TEST' | 'SIMULATION';
    }>(
      `SELECT id, email, display_name, password_hash, language, mode
       FROM users WHERE email = $1`,
      [body.email.toLowerCase()],
    );
    const user = result.rows[0];
    if (!user || !(await verifyPassword(body.password, user.password_hash)))
      throw unauthorized('Invalid credentials');
    const roleRows = await pool.query<{ role: string }>(
      'SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role',
      [user.id],
    );
    const auth = {
      id: user.id,
      email: user.email,
      roles: roleSchema.array().parse(roleRows.rows.map((row) => row.role)),
    };
    response.json({
      accessToken: await issueAccessToken(config, auth),
      expiresInSeconds: 7200,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        language: user.language,
        roles: auth.roles,
        mode: user.mode,
      },
      warning: 'DEMO authentication only; not institutional SSO',
    });
  });
  return router;
}
