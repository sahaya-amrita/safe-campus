import { createHash } from 'node:crypto';
import { Router } from 'express';
import { sosRequestSchema } from '@sahaya/contracts';
import { writeAudit } from '../audit.js';
import type { Config } from '../config.js';
import { withTransaction, type DatabasePool } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import {
  getIdempotentResponse,
  requestHash,
  requireIdempotencyKey,
  saveIdempotentResponse,
} from '../idempotency.js';
import { requireRoles, validateBody } from '../middleware.js';
import { LOCATION_COLUMNS, locationValues } from '../reporting/location.js';
import { matchResponders } from '../reporting/matching.js';

export const NO_DETAILS_TEXT = 'No details given (quick help request).';

/**
 * POST /sos: a student asks for help when no drill or incident is open.
 *
 * Inside one transaction the server records an unverified SOS incident (so
 * staff see it in the hazard queue at level L1), the student's help check-in
 * and an OPEN help request, then matches up to three responders (simulated
 * notification). The answer is a server receipt only: nobody has seen or
 * accepted the request yet, and nothing is published as an alert.
 */
export function sosRouter(pool: DatabasePool, config: Config) {
  const router = Router();

  router.post(
    '/',
    requireRoles('STUDENT'),
    validateBody(sosRequestSchema),
    async (request, response) => {
      const auth = request.auth!;
      const body = sosRequestSchema.parse(request.body);
      if (body.buildingId && !body.floorId)
        throw badRequest('floorId is required when buildingId is given');
      const key = requireIdempotencyKey(request.header('idempotency-key'));
      const hash = requestHash(body);

      const result = await withTransaction(pool, async (client) => {
        const replay = await getIdempotentResponse(client, auth.id, 'sos', key, hash);
        if (replay) return replay;

        let zoneId: string | null = null;
        if (body.floorId) {
          const floor = await client.query<{ building_id: string }>(
            'SELECT building_id FROM floors WHERE id = $1',
            [body.floorId],
          );
          if (
            floor.rowCount === 0 ||
            (body.buildingId && floor.rows[0]!.building_id !== body.buildingId)
          )
            throw notFound('Floor');
          const zone = await client.query<{ id: string }>(
            'SELECT id FROM zones WHERE floor_id = $1 ORDER BY created_at LIMIT 1',
            [body.floorId],
          );
          zoneId = zone.rows[0]?.id ?? null;
        }
        if (!zoneId) {
          const membership = await client.query<{ zone_id: string }>(
            `SELECT zone_id FROM zone_memberships WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [auth.id],
          );
          zoneId = membership.rows[0]?.zone_id ?? null;
        }

        const details = body.details ?? NO_DETAILS_TEXT;
        const location = locationValues(body.location);
        const bucket = Math.floor(new Date(body.clientCreatedAt).getTime() / (15 * 60 * 1000));
        const incident = (
          await client.query<{ id: string }>(
            `INSERT INTO incidents
            (type, description, priority, mode, reporter_id, building_id, floor_id, zone_id,
             duplicate_group_key, occurred_at, category, report_kind, ${LOCATION_COLUMNS})
           VALUES ('SOS', $1, 'CRITICAL', $2, $3, $4, $5, $6, $7, $8, $9, 'SOS',
                   $10, $11, $12, $13, $14, $15)
           RETURNING id`,
            [
              details,
              config.OPERATING_MODE,
              auth.id,
              body.buildingId ?? null,
              body.floorId ?? null,
              zoneId,
              createHash('sha256').update(`sos|${auth.id}|${bucket}`).digest('hex'),
              body.clientCreatedAt,
              body.category,
              ...location,
            ],
          )
        ).rows[0]!;
        await client.query(
          `INSERT INTO incident_reports (incident_id, reporter_id, description, zone_id, observed_at)
         VALUES ($1, $2, $3, $4, $5)`,
          [incident.id, auth.id, details, zoneId, body.clientCreatedAt],
        );
        const checkin = (
          await client.query<{ id: string; server_received_at: Date }>(
            `INSERT INTO student_checkins
            (student_id, incident_id, status, help_details, client_action_id, client_created_at,
             ${LOCATION_COLUMNS})
           VALUES ($1, $2, 'HELP_REQUESTED', $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id, server_received_at`,
            [auth.id, incident.id, details, body.clientActionId, body.clientCreatedAt, ...location],
          )
        ).rows[0]!;
        const help = (
          await client.query<{ id: string; status: string }>(
            `INSERT INTO help_requests
            (checkin_id, student_id, incident_id, zone_id, details, priority, source, category,
             building_id, floor_id, ${LOCATION_COLUMNS})
           VALUES ($1, $2, $3, $4, $5, 'CRITICAL', 'SOS', $6, $7, $8, $9, $10, $11, $12, $13, $14)
           RETURNING id, status`,
            [
              checkin.id,
              auth.id,
              incident.id,
              zoneId,
              details,
              body.category,
              body.buildingId ?? null,
              body.floorId ?? null,
              ...location,
            ],
          )
        ).rows[0]!;
        const notified = await matchResponders(client, help.id, zoneId);
        await writeAudit(client, {
          actorId: auth.id,
          action: 'SOS_RECEIVED',
          entityType: 'HELP_REQUEST',
          entityId: help.id,
          metadata: {
            incidentId: incident.id,
            checkinId: checkin.id,
            category: body.category,
            locationMethod: body.location?.method ?? null,
            respondersNotified: notified,
          },
        });

        const responseBody = {
          id: checkin.id,
          status: 'HELP_REQUESTED',
          deliveryStatus: 'SERVER_RECEIVED',
          serverReceivedAt: new Date(checkin.server_received_at).toISOString(),
          clientActionId: body.clientActionId,
          incidentId: incident.id,
          helpRequest: help,
        };
        await saveIdempotentResponse(client, auth.id, 'sos', key, hash, 201, responseBody);
        return { status: 201, body: responseBody };
      });
      response.status(result.status).json(result.body);
    },
  );

  return router;
}
