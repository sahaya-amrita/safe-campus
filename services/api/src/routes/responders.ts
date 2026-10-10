import { Router } from 'express';
import { appropriateResponderQuerySchema, cursorPaginationSchema } from '@sahaya/contracts';
import type { DatabasePool } from '../db.js';
import { ApiError, badRequest, forbidden, notFound } from '../errors.js';
import { dispatchTransitions, type DispatchStatus } from '@sahaya/contracts';
import { requireRoles, validateUuidParam } from '../middleware.js';
import { withTransaction } from '../db.js';
import { writeAudit } from '../audit.js';
import {
  getIdempotentResponse,
  requestHash,
  requireIdempotencyKey,
  saveIdempotentResponse,
} from '../idempotency.js';
import { decodeCursor, paginatedResponse } from '../pagination.js';

export function respondersRouter(pool: DatabasePool) {
  const router = Router();
  router.get('/appropriate', async (request, response) => {
    const parsed = appropriateResponderQuerySchema.safeParse(request.query);
    if (!parsed.success)
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Query parameters are invalid',
        parsed.error.flatten(),
      );
    const { zoneId, qualification } = parsed.data;
    const result = await pool.query(
      `SELECT r.id, u.display_name AS "displayName", r.approved_role AS "approvedRole",
              r.qualifications, r.assigned_zone_id AS "assignedZoneId", r.availability,
              r.contact_channel AS "contactChannel"
       FROM responders r JOIN users u ON u.id = r.user_id
       WHERE r.verified = true AND r.availability = 'AVAILABLE'
         AND ($1::uuid IS NULL OR r.assigned_zone_id = $1)
         AND ($2::text IS NULL OR $2 = ANY(r.qualifications))
       ORDER BY (r.assigned_zone_id = $1) DESC NULLS LAST, u.display_name LIMIT 20`,
      [zoneId ?? null, qualification ?? null],
    );
    response.json({
      items: result.rows,
      fallback: result.rowCount === 0 ? { type: 'OFFICIAL_CONTACT_REQUIRED', contact: null } : null,
      note: 'Results use assigned zones, not live GPS, and do not guarantee availability.',
    });
  });

  return router;
}

export function dispatchesRouter(pool: DatabasePool) {
  const router = Router();
  router.get('/', requireRoles('RESPONDER', 'ADMIN'), async (request, response) => {
    const auth = request.auth!;
    const parsed = cursorPaginationSchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Query parameters are invalid',
        parsed.error.flatten(),
      );
    }
    const cursor = decodeCursor(parsed.data.cursor);
    const unrestricted = auth.roles.includes('ADMIN');
    const values: unknown[] = [unrestricted, auth.id];
    const conditions = [
      `($1::boolean OR d.responder_id IS NULL OR d.responder_id = (
        SELECT id FROM responders WHERE user_id = $2 AND verified = true LIMIT 1
      ))`,
    ];
    if (cursor) {
      values.push(cursor.createdAt, cursor.id);
      conditions.push(
        `(d.created_at < $${values.length - 1} OR (d.created_at = $${values.length - 1} AND d.id < $${values.length}))`,
      );
    }
    values.push(parsed.data.limit + 1);
    const result = await pool.query<{ id: string; createdAt: Date; [key: string]: unknown }>(
      `SELECT d.id, d.incident_id AS "incidentId", d.responder_id AS "responderId",
              d.response_category AS "responseCategory", d.status, d.mode,
              d.acknowledged_at AS "acknowledgedAt", d.escalation_level AS "escalationLevel",
              d.created_at AS "createdAt"
       FROM dispatch_assignments d
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.created_at DESC, d.id DESC LIMIT $${values.length}`,
      values,
    );
    response.json(paginatedResponse(result.rows, parsed.data.limit));
  });

  router.post(
    '/:dispatchId/acknowledge',
    validateUuidParam('dispatchId'),
    requireRoles('RESPONDER', 'ADMIN'),
    async (request, response) => {
      const auth = request.auth!;
      const dispatchId = request.params.dispatchId as string;
      const key = requireIdempotencyKey(request.header('idempotency-key'));
      const hash = requestHash({ dispatchId, action: 'ACKNOWLEDGE' });
      const updated = await withTransaction(pool, async (client) => {
        const replay = await getIdempotentResponse(
          client,
          auth.id,
          'dispatch-acknowledge',
          key,
          hash,
        );
        if (replay) return replay;
        const found = await client.query<{
          status: DispatchStatus;
          responder_id: string | null;
        }>('SELECT status, responder_id FROM dispatch_assignments WHERE id = $1 FOR UPDATE', [
          dispatchId,
        ]);
        const dispatch = found.rows[0];
        if (!dispatch) throw notFound('Dispatch');
        const current = dispatch.status;
        if (!dispatchTransitions[current].includes('ACCEPTED')) {
          throw badRequest(`Dispatch cannot be acknowledged from ${current}`);
        }
        let responderId: string | null = null;
        if (!auth.roles.includes('ADMIN')) {
          const responder = await client.query<{ id: string }>(
            `SELECT id FROM responders
             WHERE user_id = $1 AND verified = true AND availability <> 'OFF_DUTY'`,
            [auth.id],
          );
          responderId = responder.rows[0]?.id ?? null;
          if (!responderId) throw forbidden('A verified on-duty responder profile is required');
          if (dispatch.responder_id && dispatch.responder_id !== responderId)
            throw forbidden('This dispatch is assigned to another responder');
        }
        const result = await client.query<{ id: string; status: string; acknowledgedAt: Date }>(
          `UPDATE dispatch_assignments SET status = 'ACCEPTED', responder_id = COALESCE(responder_id, $2),
             acknowledged_at = now(), updated_at = now()
         WHERE id = $1 RETURNING id, status, acknowledged_at AS "acknowledgedAt"`,
          [dispatchId, responderId],
        );
        await writeAudit(client, {
          actorId: auth.id,
          action: 'DISPATCH_ACKNOWLEDGED',
          entityType: 'DISPATCH',
          entityId: dispatchId,
          metadata: { responderId },
        });
        const body = result.rows[0];
        await saveIdempotentResponse(client, auth.id, 'dispatch-acknowledge', key, hash, 200, body);
        return { status: 200, body };
      });
      response.status(updated.status).json(updated.body);
    },
  );
  return router;
}
