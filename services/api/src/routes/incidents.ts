import { createHash } from 'node:crypto';
import { Router } from 'express';
import {
  addIncidentReportSchema,
  createIncidentSchema,
  cursorPaginationSchema,
  reviewIncidentSchema,
  verificationTransitions,
  type HazardVerificationStatus,
} from '@sahaya/contracts';
import type { Config } from '../config.js';
import type { DatabasePool } from '../db.js';
import { withTransaction } from '../db.js';
import { ApiError, badRequest, forbidden, notFound } from '../errors.js';
import { validateBody, requireRoles, validateUuidParam } from '../middleware.js';
import { writeAudit } from '../audit.js';
import {
  getIdempotentResponse,
  requestHash,
  requireIdempotencyKey,
  saveIdempotentResponse,
} from '../idempotency.js';
import { decodeCursor, paginatedResponse } from '../pagination.js';

const listRoles = ['RESPONDER', 'INCIDENT_VERIFIER', 'ADMIN'] as const;

function duplicateKey(type: string, zoneId: string | undefined, occurredAt?: string) {
  const timestamp = occurredAt ? new Date(occurredAt) : new Date();
  const bucket = Math.floor(timestamp.getTime() / (15 * 60 * 1000));
  return createHash('sha256')
    .update(`${type.trim().toLowerCase()}|${zoneId ?? 'unknown'}|${bucket}`)
    .digest('hex');
}

export function incidentsRouter(pool: DatabasePool, config: Config) {
  const router = Router();

  router.post('/', validateBody(createIncidentSchema), async (request, response) => {
    const auth = request.auth!;
    const key = requireIdempotencyKey(request.header('idempotency-key'));
    const body = createIncidentSchema.parse(request.body);
    const hash = requestHash(body);
    const result = await withTransaction(pool, async (client) => {
      const replay = await getIdempotentResponse(client, auth.id, 'create-incident', key, hash);
      if (replay) return replay;
      const incidentResult = await client.query<{ id: string; server_received_at: Date }>(
        `INSERT INTO incidents
          (type, description, priority, mode, reporter_id, building_id, floor_id, zone_id,
           duplicate_group_key, occurred_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, server_received_at`,
        [
          body.type,
          body.description,
          body.priority,
          config.OPERATING_MODE,
          auth.id,
          body.buildingId ?? null,
          body.floorId ?? null,
          body.zoneId ?? null,
          duplicateKey(body.type, body.zoneId, body.occurredAt),
          body.occurredAt ?? null,
        ],
      );
      const incident = incidentResult.rows[0]!;
      const reportResult = await client.query<{ id: string }>(
        `INSERT INTO incident_reports (incident_id, reporter_id, description, zone_id, observed_at)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [incident.id, auth.id, body.description, body.zoneId ?? null, body.occurredAt ?? null],
      );
      for (const evidence of body.evidence) {
        await client.query(
          `INSERT INTO incident_evidence (report_id, object_key, media_type, size_bytes, sha256)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            reportResult.rows[0]!.id,
            evidence.objectKey,
            evidence.mediaType,
            evidence.sizeBytes,
            evidence.sha256,
          ],
        );
      }
      let dispatchId: string | null = null;
      if (body.priority === 'HIGH' || body.priority === 'CRITICAL') {
        const dispatch = await client.query<{ id: string }>(
          `INSERT INTO dispatch_assignments (incident_id, response_category, mode)
           VALUES ($1,$2,$3) RETURNING id`,
          [incident.id, body.type.toUpperCase(), config.OPERATING_MODE],
        );
        dispatchId = dispatch.rows[0]!.id;
        await client.query(
          `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
           VALUES ('DISPATCH', $1, 'SIMULATED_DISPATCH_CREATED', $2::jsonb)`,
          [
            dispatchId,
            JSON.stringify({
              incidentId: incident.id,
              responseCategory: body.type.toUpperCase(),
              simulated: true,
            }),
          ],
        );
      }
      await writeAudit(client, {
        actorId: auth.id,
        action: 'INCIDENT_REPORTED',
        entityType: 'INCIDENT',
        entityId: incident.id,
        metadata: {
          priority: body.priority,
          verificationStatus: 'REPORTED',
          dispatchCreated: Boolean(dispatchId),
        },
      });
      const responseBody = {
        id: incident.id,
        verificationStatus: 'REPORTED',
        priority: body.priority,
        deliveryStatus: 'SERVER_RECEIVED',
        serverReceivedAt: incident.server_received_at.toISOString(),
        dispatch: dispatchId ? { id: dispatchId, status: 'CREATED', simulated: true } : null,
      };
      await saveIdempotentResponse(
        client,
        auth.id,
        'create-incident',
        key,
        hash,
        201,
        responseBody,
      );
      return { status: 201, body: responseBody };
    });
    response.status(result.status).json(result.body);
  });

  router.get('/', async (request, response) => {
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
    const privileged = listRoles.some((role) => auth.roles.includes(role));
    const values: unknown[] = [];
    const conditions: string[] = [];
    if (!privileged) {
      values.push(auth.id);
      conditions.push(`reporter_id = $${values.length}`);
    }
    if (cursor) {
      values.push(cursor.createdAt, cursor.id);
      conditions.push(
        `(created_at < $${values.length - 1} OR (created_at = $${values.length - 1} AND id < $${values.length}))`,
      );
    }
    values.push(parsed.data.limit + 1);
    const result = await pool.query<{
      id: string;
      reporter_id: string;
      createdAt: Date;
      [key: string]: unknown;
    }>(
      `SELECT id, type, description, priority, verification_status AS "verificationStatus",
              mode, building_id AS "buildingId", floor_id AS "floorId", zone_id AS "zoneId",
              reporter_id AS "reporterId", server_received_at AS "serverReceivedAt", created_at AS "createdAt"
       FROM incidents ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY created_at DESC, id DESC LIMIT $${values.length}`,
      values,
    );
    response.json(paginatedResponse(result.rows, parsed.data.limit));
  });

  router.get('/:incidentId', validateUuidParam('incidentId'), async (request, response) => {
    const auth = request.auth!;
    const result = await pool.query<{
      id: string;
      reporter_id: string;
      [key: string]: unknown;
    }>(`SELECT i.* FROM incidents i WHERE i.id = $1`, [request.params.incidentId]);
    const incident = result.rows[0];
    if (!incident) throw notFound('Incident');
    const privileged = listRoles.some((role) => auth.roles.includes(role));
    if (!privileged && incident.reporter_id !== auth.id) throw forbidden();
    const reports = await pool.query<{ count: number }>(
      'SELECT count(*)::int count FROM incident_reports WHERE incident_id = $1',
      [request.params.incidentId],
    );
    const history = await pool.query<Record<string, unknown>>(
      'SELECT * FROM incident_verification_records WHERE incident_id = $1 ORDER BY created_at',
      [request.params.incidentId],
    );
    response.json({
      ...incident,
      report_count: reports.rows[0]!.count,
      verification_history: history.rows,
    });
  });

  router.post(
    '/:incidentId/reports',
    validateUuidParam('incidentId'),
    validateBody(addIncidentReportSchema),
    async (request, response) => {
      const auth = request.auth!;
      const body = addIncidentReportSchema.parse(request.body);
      const incidentId = request.params.incidentId as string;
      const key = requireIdempotencyKey(request.header('idempotency-key'));
      const hash = requestHash({ incidentId, body });
      const result = await withTransaction(pool, async (client) => {
        const replay = await getIdempotentResponse(client, auth.id, 'incident-report', key, hash);
        if (replay) return replay;
        const incident = await client.query<{ id: string }>(
          'SELECT id FROM incidents WHERE id = $1',
          [incidentId],
        );
        if (!incident.rows[0]) throw notFound('Incident');
        const inserted = await client.query<{ id: string; serverReceivedAt: Date }>(
          `INSERT INTO incident_reports (incident_id, reporter_id, description, zone_id, observed_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, server_received_at AS "serverReceivedAt"`,
          [incidentId, auth.id, body.description, body.zoneId ?? null, body.observedAt ?? null],
        );
        const responseBody = { ...inserted.rows[0], deliveryStatus: 'SERVER_RECEIVED' };
        await saveIdempotentResponse(
          client,
          auth.id,
          'incident-report',
          key,
          hash,
          201,
          responseBody,
        );
        return { status: 201, body: responseBody };
      });
      response.status(result.status).json(result.body);
    },
  );

  router.post(
    '/:incidentId/reviews',
    validateUuidParam('incidentId'),
    requireRoles('INCIDENT_VERIFIER', 'ADMIN'),
    validateBody(reviewIncidentSchema),
    async (request, response) => {
      const auth = request.auth!;
      const incidentId = request.params.incidentId as string;
      const body = reviewIncidentSchema.parse(request.body);
      const key = requireIdempotencyKey(request.header('idempotency-key'));
      const hash = requestHash({ incidentId, body });
      const record = await withTransaction(pool, async (client) => {
        const replay = await getIdempotentResponse(client, auth.id, 'incident-review', key, hash);
        if (replay) return replay;
        const found = await client.query<{ verification_status: HazardVerificationStatus }>(
          'SELECT verification_status FROM incidents WHERE id = $1 FOR UPDATE',
          [incidentId],
        );
        const current = found.rows[0]?.verification_status;
        if (!current) throw notFound('Incident');
        if (!verificationTransitions[current].includes(body.status)) {
          throw badRequest(`Invalid verification transition from ${current} to ${body.status}`);
        }
        await client.query(
          'UPDATE incidents SET verification_status = $1, updated_at = now() WHERE id = $2',
          [body.status, incidentId],
        );
        const inserted = await client.query<{ id: string; createdAt: Date }>(
          `INSERT INTO incident_verification_records
            (incident_id, reviewer_id, from_status, to_status, reason, evidence_ids)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at AS "createdAt"`,
          [incidentId, auth.id, current, body.status, body.reason, body.evidenceIds],
        );
        await writeAudit(client, {
          actorId: auth.id,
          action: 'INCIDENT_VERIFICATION_CHANGED',
          entityType: 'INCIDENT',
          entityId: incidentId,
          metadata: { from: current, to: body.status, reason: body.reason },
        });
        const responseBody = { ...inserted.rows[0], fromStatus: current, toStatus: body.status };
        await saveIdempotentResponse(
          client,
          auth.id,
          'incident-review',
          key,
          hash,
          201,
          responseBody,
        );
        return { status: 201, body: responseBody };
      });
      response.status(record.status).json(record.body);
    },
  );

  return router;
}
