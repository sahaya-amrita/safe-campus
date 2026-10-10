import { Router } from 'express';
import {
  assignHelpRequestSchema,
  helpRequestListQuerySchema,
  helpRequestTransitions,
  type HelpRequestStatus,
} from '@sahaya/contracts';
import type pg from 'pg';
import type { DatabasePool } from '../db.js';
import { withTransaction } from '../db.js';
import { writeAudit } from '../audit.js';
import { ApiError, badRequest, forbidden, notFound } from '../errors.js';
import {
  getIdempotentResponse,
  requestHash,
  requireIdempotencyKey,
  saveIdempotentResponse,
} from '../idempotency.js';
import { requireRoles, validateBody, validateUuidParam } from '../middleware.js';
import { decodeCursor, paginatedResponse } from '../pagination.js';

type HelpRequestRow = {
  id: string;
  student_id: string;
  zone_id: string | null;
  status: HelpRequestStatus;
  assigned_responder_id: string | null;
};

async function responderForUser(client: pg.PoolClient, userId: string) {
  const result = await client.query<{
    id: string;
    assigned_zone_id: string | null;
  }>(
    `SELECT id, assigned_zone_id FROM responders
     WHERE user_id = $1 AND verified = true AND availability <> 'OFF_DUTY'`,
    [userId],
  );
  return result.rows[0];
}

function requireTransition(current: HelpRequestStatus, next: HelpRequestStatus) {
  if (!helpRequestTransitions[current].includes(next)) {
    throw badRequest(`Help request cannot transition from ${current} to ${next}`);
  }
}

async function lockedHelpRequest(client: pg.PoolClient, id: string) {
  const result = await client.query<HelpRequestRow>(
    `SELECT id, student_id, zone_id, status, assigned_responder_id
     FROM help_requests WHERE id = $1 FOR UPDATE`,
    [id],
  );
  if (!result.rows[0]) throw notFound('Help request');
  return result.rows[0];
}

function ensureResponderZone(
  responder: { id: string; assigned_zone_id: string | null } | undefined,
  helpRequest: HelpRequestRow,
) {
  if (!responder) throw forbidden('A verified on-duty responder profile is required');
  if (!helpRequest.zone_id || responder.assigned_zone_id !== helpRequest.zone_id) {
    throw forbidden('The help request is outside the responder assigned zone');
  }
}

async function transitionResponse(
  client: pg.PoolClient,
  id: string,
  status: HelpRequestStatus,
  extraSql: string,
  parameters: unknown[],
): Promise<Record<string, unknown>> {
  const result = await client.query<Record<string, unknown>>(
    `UPDATE help_requests SET status = $2, updated_at = now(), ${extraSql}
     WHERE id = $1
     RETURNING id, student_id AS "studentId", incident_id AS "incidentId",
       drill_id AS "drillId", zone_id AS "zoneId", status, priority, details,
       acknowledged_by AS "acknowledgedBy", assigned_responder_id AS "assignedResponderId",
       acknowledged_at AS "acknowledgedAt", assigned_at AS "assignedAt",
       resolved_at AS "resolvedAt", cancelled_at AS "cancelledAt",
       created_at AS "createdAt", updated_at AS "updatedAt"`,
    [id, status, ...parameters],
  );
  return result.rows[0]!;
}

export function helpRequestsRouter(pool: DatabasePool) {
  const router = Router();

  // A student's own requests, so the app can show server-recorded lifecycle state.
  // Responder identity is not exposed; only whether someone is assigned.
  router.get('/mine', requireRoles('STUDENT'), async (request, response) => {
    const result = await pool.query(
      `SELECT id, incident_id AS "incidentId", drill_id AS "drillId", status, details,
              assigned_responder_id IS NOT NULL AS "responderAssigned",
              acknowledged_at AS "acknowledgedAt", assigned_at AS "assignedAt",
              resolved_at AS "resolvedAt", cancelled_at AS "cancelledAt",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM help_requests WHERE student_id = $1
       ORDER BY created_at DESC, id DESC LIMIT 50`,
      [request.auth!.id],
    );
    response.json({ items: result.rows });
  });

  router.get(
    '/',
    requireRoles('RESPONDER', 'INCIDENT_VERIFIER', 'ADMIN'),
    async (request, response) => {
      const parsed = helpRequestListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'Query parameters are invalid',
          parsed.error.flatten(),
        );
      }
      const auth = request.auth!;
      const { status, limit } = parsed.data;
      const cursor = decodeCursor(parsed.data.cursor);
      const unrestricted = auth.roles.includes('ADMIN') || auth.roles.includes('INCIDENT_VERIFIER');
      const values: unknown[] = [unrestricted, auth.id];
      const conditions = [
        `($1::boolean OR h.zone_id = (
          SELECT assigned_zone_id FROM responders
          WHERE user_id = $2 AND verified = true AND availability <> 'OFF_DUTY' LIMIT 1
        ))`,
      ];
      if (status) {
        values.push(status);
        conditions.push(`h.status = $${values.length}`);
      }
      if (cursor) {
        values.push(cursor.createdAt, cursor.id);
        conditions.push(
          `(h.created_at < $${values.length - 1} OR (h.created_at = $${values.length - 1} AND h.id < $${values.length}))`,
        );
      }
      values.push(limit + 1);
      const result = await pool.query<{
        id: string;
        createdAt: Date;
        [key: string]: unknown;
      }>(
        `SELECT h.id, h.student_id AS "studentId", h.incident_id AS "incidentId",
          h.drill_id AS "drillId", h.zone_id AS "zoneId", h.status, h.priority, h.details,
          h.assigned_responder_id AS "assignedResponderId", h.acknowledged_at AS "acknowledgedAt",
          h.assigned_at AS "assignedAt", h.resolved_at AS "resolvedAt",
          h.cancelled_at AS "cancelledAt", h.created_at AS "createdAt", h.updated_at AS "updatedAt"
         FROM help_requests h WHERE ${conditions.join(' AND ')}
         ORDER BY h.created_at DESC, h.id DESC LIMIT $${values.length}`,
        values,
      );
      response.json(paginatedResponse(result.rows, limit));
    },
  );

  router.post(
    '/:helpRequestId/acknowledge',
    validateUuidParam('helpRequestId'),
    requireRoles('RESPONDER', 'ADMIN'),
    async (request, response) => {
      const auth = request.auth!;
      const id = request.params.helpRequestId as string;
      const key = requireIdempotencyKey(request.header('idempotency-key'));
      const hash = requestHash({ id, action: 'ACKNOWLEDGE' });
      const result = await withTransaction(pool, async (client) => {
        const replay = await getIdempotentResponse(
          client,
          auth.id,
          'help-request-transition',
          key,
          hash,
        );
        if (replay) return replay;
        const helpRequest = await lockedHelpRequest(client, id);
        requireTransition(helpRequest.status, 'ACKNOWLEDGED');
        const responder = auth.roles.includes('ADMIN')
          ? undefined
          : await responderForUser(client, auth.id);
        if (!auth.roles.includes('ADMIN')) ensureResponderZone(responder, helpRequest);
        const body = await transitionResponse(
          client,
          id,
          'ACKNOWLEDGED',
          'acknowledged_by = $3, acknowledged_at = now()',
          [responder?.id ?? null],
        );
        await writeAudit(client, {
          actorId: auth.id,
          action: 'HELP_REQUEST_ACKNOWLEDGED',
          entityType: 'HELP_REQUEST',
          entityId: id,
          metadata: { responderId: responder?.id ?? null },
        });
        await saveIdempotentResponse(
          client,
          auth.id,
          'help-request-transition',
          key,
          hash,
          200,
          body,
        );
        return { status: 200, body };
      });
      response.status(result.status).json(result.body);
    },
  );

  router.post(
    '/:helpRequestId/assign',
    validateUuidParam('helpRequestId'),
    requireRoles('RESPONDER', 'ADMIN'),
    validateBody(assignHelpRequestSchema),
    async (request, response) => {
      const auth = request.auth!;
      const id = request.params.helpRequestId as string;
      const input = assignHelpRequestSchema.parse(request.body);
      const key = requireIdempotencyKey(request.header('idempotency-key'));
      const hash = requestHash({ id, action: 'ASSIGN', input });
      const result = await withTransaction(pool, async (client) => {
        const replay = await getIdempotentResponse(
          client,
          auth.id,
          'help-request-transition',
          key,
          hash,
        );
        if (replay) return replay;
        const helpRequest = await lockedHelpRequest(client, id);
        requireTransition(helpRequest.status, 'ASSIGNED');
        const actorResponder = await responderForUser(client, auth.id);
        let assignee = actorResponder;
        if (auth.roles.includes('ADMIN')) {
          if (!input.responderId)
            throw badRequest('responderId is required for administrator assignment');
          const selected = await client.query<{ id: string; assigned_zone_id: string | null }>(
            `SELECT id, assigned_zone_id FROM responders
             WHERE id = $1 AND verified = true AND availability <> 'OFF_DUTY'`,
            [input.responderId],
          );
          assignee = selected.rows[0];
        } else if (input.responderId && input.responderId !== actorResponder?.id) {
          throw forbidden('Responders may assign only themselves');
        }
        ensureResponderZone(assignee, helpRequest);
        const body = await transitionResponse(
          client,
          id,
          'ASSIGNED',
          'assigned_responder_id = $3, assigned_at = now()',
          [assignee!.id],
        );
        await writeAudit(client, {
          actorId: auth.id,
          action: 'HELP_REQUEST_ASSIGNED',
          entityType: 'HELP_REQUEST',
          entityId: id,
          metadata: { responderId: assignee!.id },
        });
        await saveIdempotentResponse(
          client,
          auth.id,
          'help-request-transition',
          key,
          hash,
          200,
          body,
        );
        return { status: 200, body };
      });
      response.status(result.status).json(result.body);
    },
  );

  router.post(
    '/:helpRequestId/resolve',
    validateUuidParam('helpRequestId'),
    requireRoles('RESPONDER', 'ADMIN'),
    async (request, response) => {
      const auth = request.auth!;
      const id = request.params.helpRequestId as string;
      const key = requireIdempotencyKey(request.header('idempotency-key'));
      const hash = requestHash({ id, action: 'RESOLVE' });
      const result = await withTransaction(pool, async (client) => {
        const replay = await getIdempotentResponse(
          client,
          auth.id,
          'help-request-transition',
          key,
          hash,
        );
        if (replay) return replay;
        const helpRequest = await lockedHelpRequest(client, id);
        requireTransition(helpRequest.status, 'RESOLVED');
        if (!auth.roles.includes('ADMIN')) {
          const responder = await responderForUser(client, auth.id);
          ensureResponderZone(responder, helpRequest);
          if (helpRequest.assigned_responder_id !== responder!.id) {
            throw forbidden('Only the assigned responder may resolve this help request');
          }
        }
        const body = await transitionResponse(client, id, 'RESOLVED', 'resolved_at = now()', []);
        await writeAudit(client, {
          actorId: auth.id,
          action: 'HELP_REQUEST_RESOLVED',
          entityType: 'HELP_REQUEST',
          entityId: id,
        });
        await saveIdempotentResponse(
          client,
          auth.id,
          'help-request-transition',
          key,
          hash,
          200,
          body,
        );
        return { status: 200, body };
      });
      response.status(result.status).json(result.body);
    },
  );

  router.post(
    '/:helpRequestId/cancel',
    validateUuidParam('helpRequestId'),
    requireRoles('STUDENT', 'ADMIN'),
    async (request, response) => {
      const auth = request.auth!;
      const id = request.params.helpRequestId as string;
      const key = requireIdempotencyKey(request.header('idempotency-key'));
      const hash = requestHash({ id, action: 'CANCEL' });
      const result = await withTransaction(pool, async (client) => {
        const replay = await getIdempotentResponse(
          client,
          auth.id,
          'help-request-transition',
          key,
          hash,
        );
        if (replay) return replay;
        const helpRequest = await lockedHelpRequest(client, id);
        if (!auth.roles.includes('ADMIN') && helpRequest.student_id !== auth.id) throw forbidden();
        requireTransition(helpRequest.status, 'CANCELLED');
        const body = await transitionResponse(client, id, 'CANCELLED', 'cancelled_at = now()', []);
        await writeAudit(client, {
          actorId: auth.id,
          action: 'HELP_REQUEST_CANCELLED',
          entityType: 'HELP_REQUEST',
          entityId: id,
        });
        await saveIdempotentResponse(
          client,
          auth.id,
          'help-request-transition',
          key,
          hash,
          200,
          body,
        );
        return { status: 200, body };
      });
      response.status(result.status).json(result.body);
    },
  );

  return router;
}
