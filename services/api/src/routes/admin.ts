import { Router } from 'express';
import {
  adminUserListQuerySchema,
  auditListQuerySchema,
  grantRoleSchema,
  revokeRoleSchema,
  roleSchema,
  setUserStatusSchema,
  type AdminUser,
  type AuditEventView,
  type Role,
} from '@sahaya/contracts';
import type pg from 'pg';
import { writeAudit } from '../audit.js';
import { withTransaction, type DatabasePool } from '../db.js';
import { ApiError, conflict, notFound } from '../errors.js';
import { requireRoles, validateBody, validateUuidParam } from '../middleware.js';
import { decodeCursor, encodeCursor } from '../pagination.js';

/**
 * ADMIN-only account management and audit reads. Every change needs a
 * reason and writes an audit event. Guards prevent an admin from removing
 * their own ADMIN role or disabling themselves, and the last active ADMIN
 * can never be removed or disabled.
 */

function badQuery(error: { flatten: () => unknown }) {
  return new ApiError(400, 'VALIDATION_ERROR', 'Query parameters are invalid', error.flatten());
}

async function activeAdminCount(client: pg.PoolClient): Promise<number> {
  const result = await client.query<{ count: string | number }>(
    `SELECT count(*) AS count FROM user_roles r JOIN users u ON u.id = r.user_id
     WHERE r.role = 'ADMIN' AND u.status = 'ACTIVE'`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function lockUser(client: pg.PoolClient, id: string) {
  const user = (
    await client.query<{ id: string; status: string }>(
      'SELECT id, status FROM users WHERE id = $1',
      [id],
    )
  ).rows[0];
  if (!user) throw notFound('User');
  return user;
}

async function rolesOf(client: pg.PoolClient | DatabasePool, id: string): Promise<Role[]> {
  const result = await client.query<{ role: string }>(
    'SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role',
    [id],
  );
  return roleSchema.array().parse(result.rows.map((row) => row.role));
}

function iso(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

export function adminRouter(pool: DatabasePool) {
  const router = Router();
  router.use(requireRoles('ADMIN'));

  router.get('/users', async (request, response) => {
    const parsed = adminUserListQuerySchema.safeParse(request.query);
    if (!parsed.success) throw badQuery(parsed.error);
    const { q, role, status, limit } = parsed.data;
    const cursor = decodeCursor(parsed.data.cursor);
    const values: unknown[] = [];
    const conditions: string[] = ['1 = 1'];
    if (q) {
      const pattern = `%${q.toLowerCase()}%`;
      values.push(pattern, pattern);
      conditions.push(
        `(lower(u.email) LIKE $${values.length - 1} OR lower(u.display_name) LIKE $${values.length})`,
      );
    }
    if (status) {
      values.push(status);
      conditions.push(`u.status = $${values.length}`);
    }
    if (role) {
      values.push(role);
      conditions.push(`u.id IN (SELECT user_id FROM user_roles WHERE role = $${values.length})`);
    }
    if (cursor) {
      values.push(cursor.createdAt, cursor.id);
      conditions.push(
        `(u.created_at < $${values.length - 1} OR (u.created_at = $${values.length - 1} AND u.id < $${values.length}))`,
      );
    }
    values.push(limit + 1);
    const rows = (
      await pool.query<{
        id: string;
        email: string;
        display_name: string;
        status: 'ACTIVE' | 'DISABLED';
        email_verified_at: Date | null;
        last_sign_in_at: Date | null;
        created_at: Date;
      }>(
        `SELECT u.id, u.email, u.display_name, u.status, u.email_verified_at,
           u.last_sign_in_at, u.created_at
         FROM users u WHERE ${conditions.join(' AND ')}
         ORDER BY u.created_at DESC, u.id DESC LIMIT $${values.length}`,
        values,
      )
    ).rows;
    const page = rows.slice(0, limit);
    const items: AdminUser[] = [];
    for (const row of page) {
      items.push({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        roles: await rolesOf(pool, row.id),
        status: row.status,
        emailVerifiedAt: iso(row.email_verified_at),
        lastSignInAt: iso(row.last_sign_in_at),
        createdAt: iso(row.created_at)!,
      });
    }
    const last = page.at(-1);
    response.json({
      items,
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: iso(last.created_at)!, id: last.id })
          : null,
    });
  });

  router.post(
    '/users/:userId/roles',
    validateUuidParam('userId'),
    validateBody(grantRoleSchema),
    async (request, response) => {
      const { role, reason } = grantRoleSchema.parse(request.body);
      const id = request.params.userId as string;
      const actorId = request.auth!.id;
      const result = await withTransaction(pool, async (client) => {
        const user = await lockUser(client, id);
        if (user.status !== 'ACTIVE') throw conflict('Enable the account before granting roles');
        const before = await rolesOf(client, id);
        if (before.includes(role)) return { changed: false, roles: before };
        await client.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [id, role]);
        await writeAudit(client, {
          actorId,
          action: 'ROLE_GRANTED',
          entityType: 'user',
          entityId: id,
          metadata: { role, reason, before },
        });
        return { changed: true, roles: await rolesOf(client, id) };
      });
      response.json(result);
    },
  );

  router.post(
    '/users/:userId/roles/:role/revoke',
    validateUuidParam('userId'),
    validateBody(revokeRoleSchema),
    async (request, response) => {
      const role = roleSchema.safeParse(request.params.role);
      if (!role.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Unknown role');
      const { reason } = revokeRoleSchema.parse(request.body);
      const id = request.params.userId as string;
      const actorId = request.auth!.id;
      const result = await withTransaction(pool, async (client) => {
        await lockUser(client, id);
        const before = await rolesOf(client, id);
        if (!before.includes(role.data)) return { changed: false, roles: before };
        if (role.data === 'ADMIN') {
          if (id === actorId) throw conflict('You cannot remove your own ADMIN role');
          if ((await activeAdminCount(client)) <= 1)
            throw conflict('The last active ADMIN cannot be removed');
        }
        await client.query('DELETE FROM user_roles WHERE user_id = $1 AND role = $2', [
          id,
          role.data,
        ]);
        await writeAudit(client, {
          actorId,
          action: 'ROLE_REVOKED',
          entityType: 'user',
          entityId: id,
          metadata: { role: role.data, reason, before },
        });
        return { changed: true, roles: await rolesOf(client, id) };
      });
      response.json(result);
    },
  );

  router.post(
    '/users/:userId/status',
    validateUuidParam('userId'),
    validateBody(setUserStatusSchema),
    async (request, response) => {
      const { status, reason } = setUserStatusSchema.parse(request.body);
      const id = request.params.userId as string;
      const actorId = request.auth!.id;
      const result = await withTransaction(pool, async (client) => {
        const user = await lockUser(client, id);
        if (user.status === status) return { changed: false, status };
        if (status === 'DISABLED') {
          if (id === actorId) throw conflict('You cannot disable your own account');
          const roles = await rolesOf(client, id);
          if (roles.includes('ADMIN') && (await activeAdminCount(client)) <= 1)
            throw conflict('The last active ADMIN cannot be disabled');
        }
        // Disabling also ends every existing session of the account.
        await client.query(
          `UPDATE users SET status = $2, updated_at = now(),
             sessions_valid_after = CASE WHEN $2 = 'DISABLED' THEN now() ELSE sessions_valid_after END
           WHERE id = $1`,
          [id, status],
        );
        await writeAudit(client, {
          actorId,
          action: status === 'DISABLED' ? 'USER_DISABLED' : 'USER_ENABLED',
          entityType: 'user',
          entityId: id,
          metadata: { reason },
        });
        return { changed: true, status };
      });
      response.json(result);
    },
  );

  router.get('/audit-events', async (request, response) => {
    const parsed = auditListQuerySchema.safeParse(request.query);
    if (!parsed.success) throw badQuery(parsed.error);
    const { action, entityType, actorId, before, limit } = parsed.data;
    const values: unknown[] = [];
    const conditions: string[] = ['1 = 1'];
    if (action) {
      values.push(action);
      conditions.push(`a.action = $${values.length}`);
    }
    if (entityType) {
      values.push(entityType);
      conditions.push(`a.entity_type = $${values.length}`);
    }
    if (actorId) {
      values.push(actorId);
      conditions.push(`a.actor_id = $${values.length}`);
    }
    if (before) {
      values.push(before);
      conditions.push(`a.id < $${values.length}`);
    }
    values.push(limit + 1);
    const rows = (
      await pool.query<{
        id: string | number;
        actor_id: string | null;
        action: string;
        entity_type: string;
        entity_id: string | null;
        metadata: Record<string, unknown>;
        created_at: Date;
      }>(
        `SELECT a.id, a.actor_id, a.action, a.entity_type, a.entity_id, a.metadata, a.created_at
         FROM audit_events a
         WHERE ${conditions.join(' AND ')}
         ORDER BY a.id DESC LIMIT $${values.length}`,
        values,
      )
    ).rows;
    // Actor emails in a second query (keeps the main query a single-table scan).
    const actorIds = [...new Set(rows.map((row) => row.actor_id).filter((id) => id !== null))];
    const emails = new Map<string, string>();
    if (actorIds.length > 0) {
      const placeholders = actorIds.map((_, i) => `$${i + 1}`).join(', ');
      const actors = await pool.query<{ id: string; email: string }>(
        `SELECT id, email FROM users WHERE id IN (${placeholders})`,
        actorIds,
      );
      for (const actor of actors.rows) emails.set(actor.id, actor.email);
    }
    const items: AuditEventView[] = rows.slice(0, limit).map((row) => ({
      id: Number(row.id),
      actorId: row.actor_id,
      actorEmail: row.actor_id ? (emails.get(row.actor_id) ?? null) : null,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: row.metadata ?? {},
      createdAt: iso(row.created_at)!,
    }));
    response.json({
      items,
      nextBefore: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
    });
  });

  return router;
}
