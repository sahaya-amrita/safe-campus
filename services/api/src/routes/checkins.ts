import { Router } from 'express';
import { latestCheckInQuerySchema, submitCheckInSchema } from '@sahaya/contracts';
import type { DatabasePool } from '../db.js';
import { withTransaction } from '../db.js';
import { ApiError, badRequest, notFound } from '../errors.js';
import { getIdempotentResponse, requestHash, saveIdempotentResponse } from '../idempotency.js';
import { requireRoles, validateBody } from '../middleware.js';
import { writeAudit } from '../audit.js';
import { LOCATION_COLUMNS, locationValues } from '../reporting/location.js';
import { matchResponders } from '../reporting/matching.js';
import { NO_DETAILS_TEXT } from './sos.js';

function idempotencyKey(value: string | undefined) {
  if (!value || value.length < 8 || value.length > 200)
    throw badRequest('A valid Idempotency-Key header is required');
  return value;
}

export function checkinsRouter(pool: DatabasePool) {
  const router = Router();

  router.post(
    '/',
    requireRoles('STUDENT'),
    validateBody(submitCheckInSchema),
    async (request, response) => {
      const auth = request.auth!;
      const body = submitCheckInSchema.parse(request.body);
      const key = idempotencyKey(request.header('idempotency-key'));
      const hash = requestHash(body);
      const result = await withTransaction(pool, async (client) => {
        const replay = await getIdempotentResponse(client, auth.id, 'checkin', key, hash);
        if (replay) return replay;
        // A quick help request may carry no text (Phase 3); the record still says so.
        const helpDetails =
          body.helpDetails ?? (body.status === 'HELP_REQUESTED' ? NO_DETAILS_TEXT : null);
        const target = body.incidentId
          ? await client.query<{ zone_id: string | null }>(
              'SELECT zone_id FROM incidents WHERE id = $1',
              [body.incidentId],
            )
          : await client.query<{ zone_id: string | null }>(
              'SELECT NULL::uuid AS zone_id FROM drills WHERE id = $1',
              [body.drillId],
            );
        if (target.rowCount === 0) throw notFound(body.incidentId ? 'Incident' : 'Drill');
        const inserted = await client.query<{
          id: string;
          server_received_at: Date;
        }>(
          `INSERT INTO student_checkins
          (student_id, incident_id, drill_id, status, help_details, client_action_id, client_created_at,
           ${LOCATION_COLUMNS})
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (student_id, client_action_id) DO UPDATE SET student_id = EXCLUDED.student_id
         RETURNING id, server_received_at`,
          [
            auth.id,
            body.incidentId ?? null,
            body.drillId ?? null,
            body.status,
            helpDetails,
            body.clientActionId,
            body.clientCreatedAt,
            ...locationValues(body.location),
          ],
        );
        const row = inserted.rows[0]!;
        let helpRequest: { id: string; status: string } | null = null;
        if (body.status === 'HELP_REQUESTED') {
          let zoneId = target.rows[0]?.zone_id ?? null;
          if (!zoneId) {
            const membership = await client.query<{ zone_id: string }>(
              `SELECT zone_id FROM zone_memberships
               WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
              [auth.id],
            );
            zoneId = membership.rows[0]?.zone_id ?? null;
          }
          const opened = await client.query<{ id: string; status: string }>(
            `INSERT INTO help_requests
              (checkin_id, student_id, incident_id, drill_id, zone_id, details, ${LOCATION_COLUMNS})
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (checkin_id) DO UPDATE SET checkin_id = EXCLUDED.checkin_id
             RETURNING id, status`,
            [
              row.id,
              auth.id,
              body.incidentId ?? null,
              body.drillId ?? null,
              zoneId,
              helpDetails,
              ...locationValues(body.location),
            ],
          );
          helpRequest = opened.rows[0]!;
          const notified = await matchResponders(client, helpRequest.id, zoneId);
          await writeAudit(client, {
            actorId: auth.id,
            action: 'HELP_REQUEST_OPENED',
            entityType: 'HELP_REQUEST',
            entityId: helpRequest.id,
            metadata: {
              checkinId: row.id,
              incidentId: body.incidentId,
              drillId: body.drillId,
              respondersNotified: notified,
            },
          });
        }
        await writeAudit(client, {
          actorId: auth.id,
          action: 'STUDENT_CHECKIN_RECEIVED',
          entityType: 'STUDENT_CHECKIN',
          entityId: row.id,
          metadata: { status: body.status, incidentId: body.incidentId, drillId: body.drillId },
        });
        const responseBody = {
          id: row.id,
          status: body.status,
          deliveryStatus: 'SERVER_RECEIVED',
          serverReceivedAt: row.server_received_at.toISOString(),
          clientActionId: body.clientActionId,
          helpRequest,
        };
        await saveIdempotentResponse(client, auth.id, 'checkin', key, hash, 201, responseBody);
        return { status: 201, body: responseBody };
      });
      response.status(result.status).json(result.body);
    },
  );

  router.get('/me/latest', requireRoles('STUDENT'), async (request, response) => {
    const auth = request.auth!;
    const parsed = latestCheckInQuerySchema.safeParse(request.query);
    if (!parsed.success)
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Query parameters are invalid',
        parsed.error.flatten(),
      );
    const { incidentId, drillId } = parsed.data;
    const result = await pool.query(
      `SELECT id, status, help_details AS "helpDetails", delivery_status AS "deliveryStatus",
              client_action_id AS "clientActionId", client_created_at AS "clientCreatedAt",
              server_received_at AS "serverReceivedAt"
       FROM student_checkins
       WHERE student_id = $1 AND ${typeof incidentId === 'string' ? 'incident_id = $2' : 'drill_id = $2'}
       ORDER BY server_received_at DESC LIMIT 1`,
      [auth.id, incidentId ?? drillId],
    );
    response.json(
      result.rows[0] ?? {
        status: 'UNCONFIRMED',
        deliveryStatus: null,
        serverReceivedAt: null,
      },
    );
  });

  router.get(
    '/help-requests',
    requireRoles('RESPONDER', 'INCIDENT_VERIFIER', 'ADMIN'),
    async (request, response) => {
      const auth = request.auth!;
      const unrestricted = auth.roles.includes('ADMIN') || auth.roles.includes('INCIDENT_VERIFIER');
      const result = await pool.query(
        `SELECT h.id, h.student_id AS "studentId", h.incident_id AS "incidentId",
                h.drill_id AS "drillId", h.zone_id AS "zoneId", h.status,
                h.priority, h.details AS "helpDetails", h.assigned_responder_id AS "assignedResponderId",
                h.acknowledged_at AS "acknowledgedAt", h.resolved_at AS "resolvedAt",
                h.created_at AS "createdAt", h.updated_at AS "updatedAt"
         FROM help_requests h
         WHERE h.status NOT IN ('RESOLVED', 'CANCELLED')
         AND ($1::boolean OR h.zone_id = (
           SELECT assigned_zone_id FROM responders
           WHERE user_id = $2 AND verified = true LIMIT 1
         ))
         ORDER BY h.created_at DESC, h.id DESC LIMIT 100`,
        [unrestricted, auth.id],
      );
      response.json({
        items: result.rows,
        nextCursor: null,
        deprecated: 'Use GET /api/v1/help-requests for cursor pagination and lifecycle fields.',
      });
    },
  );

  return router;
}

export function incidentCheckinsRouter(pool: DatabasePool) {
  const router = Router({ mergeParams: true });
  router.get(
    '/summary',
    requireRoles('RESPONDER', 'INCIDENT_VERIFIER', 'ADMIN'),
    async (request, response) => {
      const eligible = await pool.query<{ user_id: string }>(
        `SELECT DISTINCT zm.user_id FROM zone_memberships zm
         JOIN incidents i ON i.zone_id = zm.zone_id WHERE i.id = $1`,
        [request.params.incidentId],
      );
      const latest = await pool.query<{
        student_id: string;
        status: 'CONFIRMED_SAFE' | 'HELP_REQUESTED';
      }>(
        `SELECT DISTINCT ON (student_id) student_id, status FROM student_checkins
         WHERE incident_id = $1 ORDER BY student_id, server_received_at DESC`,
        [request.params.incidentId],
      );
      const latestByStudent = new Map(latest.rows.map((row) => [row.student_id, row.status]));
      const counts = { CONFIRMED_SAFE: 0, HELP_REQUESTED: 0, UNCONFIRMED: 0 };
      for (const student of eligible.rows) {
        const status = latestByStudent.get(student.user_id) ?? 'UNCONFIRMED';
        counts[status] += 1;
      }
      response.json({
        incidentId: request.params.incidentId,
        counts,
        note: 'UNCONFIRMED means no current server-received check-in; it does not imply injury or absence.',
      });
    },
  );
  return router;
}
