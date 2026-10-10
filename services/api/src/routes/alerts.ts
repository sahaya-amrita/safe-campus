import { Router } from 'express';
import { createAlertSchema } from '@sahaya/contracts';
import type { DatabasePool } from '../db.js';
import { withTransaction } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { requireRoles, validateBody, validateUuidParam } from '../middleware.js';
import { writeAudit } from '../audit.js';
import {
  getIdempotentResponse,
  requestHash,
  requireIdempotencyKey,
  saveIdempotentResponse,
} from '../idempotency.js';

export function alertsRouter(pool: DatabasePool) {
  const router = Router();

  router.post(
    '/',
    requireRoles('ADMIN'),
    validateBody(createAlertSchema),
    async (request, response) => {
      const auth = request.auth!;
      const body = createAlertSchema.parse(request.body);
      const key = requireIdempotencyKey(request.header('idempotency-key'));
      const hash = requestHash(body);
      const alert = await withTransaction(pool, async (client) => {
        const replay = await getIdempotentResponse(client, auth.id, 'alert-create', key, hash);
        if (replay) return replay;
        const result = await client.query<{ id: string }>(
          `INSERT INTO emergency_alerts
          (incident_id, title, message, precautionary, mode, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [
            body.incidentId ?? null,
            body.title,
            body.message,
            body.precautionary,
            body.mode,
            auth.id,
          ],
        );
        const id = result.rows[0]!.id;
        for (const zoneId of body.zoneIds) {
          await client.query('INSERT INTO alert_zones (alert_id, zone_id) VALUES ($1,$2)', [
            id,
            zoneId,
          ]);
        }
        await writeAudit(client, {
          actorId: auth.id,
          action: 'ALERT_DRAFTED',
          entityType: 'ALERT',
          entityId: id,
          metadata: {
            mode: body.mode,
            precautionary: body.precautionary,
            zoneCount: body.zoneIds.length,
          },
        });
        const responseBody = { id, status: 'DRAFT', mode: body.mode, zoneIds: body.zoneIds };
        await saveIdempotentResponse(client, auth.id, 'alert-create', key, hash, 201, responseBody);
        return { status: 201, body: responseBody };
      });
      response.status(alert.status).json(alert.body);
    },
  );

  router.post(
    '/:alertId/authorize',
    validateUuidParam('alertId'),
    requireRoles('ADMIN'),
    async (request, response) => {
      const auth = request.auth!;
      const key = requireIdempotencyKey(request.header('idempotency-key'));
      const hash = requestHash({ alertId: request.params.alertId, action: 'AUTHORIZE' });
      const result = await withTransaction(pool, async (client) => {
        const replay = await getIdempotentResponse(client, auth.id, 'alert-authorize', key, hash);
        if (replay) return replay;
        const found = await client.query<{ id: string; status: string; mode: string }>(
          'SELECT id, status, mode FROM emergency_alerts WHERE id = $1 FOR UPDATE',
          [request.params.alertId],
        );
        const alert = found.rows[0];
        if (!alert) throw notFound('Alert');
        if (alert.status === 'DRAFT') {
          await client.query(
            `UPDATE emergency_alerts SET status = 'QUEUED', authorized_by = $2,
           authorized_at = now(), updated_at = now() WHERE id = $1`,
            [alert.id, auth.id],
          );
          await client.query(
            `INSERT INTO alert_delivery_records (alert_id, recipient_id)
         SELECT DISTINCT $1::uuid, zm.user_id FROM alert_zones az
         JOIN zone_memberships zm ON zm.zone_id = az.zone_id
         WHERE az.alert_id = $1 ON CONFLICT DO NOTHING`,
            [alert.id],
          );
          await client.query(
            `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
         VALUES ('ALERT', $1, 'SIMULATED_ZONE_ALERT_QUEUED', $2::jsonb)`,
            [alert.id, JSON.stringify({ alertId: alert.id, mode: alert.mode, simulated: true })],
          );
          await writeAudit(client, {
            actorId: auth.id,
            action: 'ALERT_AUTHORIZED_FOR_SIMULATED_DELIVERY',
            entityType: 'ALERT',
            entityId: alert.id,
            metadata: { mode: alert.mode },
          });
        } else if (alert.status !== 'QUEUED') {
          throw badRequest(`Alert cannot be authorized from ${alert.status}`);
        }
        const count = await client.query<{ count: number }>(
          'SELECT count(*)::int count FROM alert_delivery_records WHERE alert_id = $1',
          [alert.id],
        );
        const responseBody = {
          id: alert.id,
          status: 'QUEUED',
          mode: alert.mode,
          recipientCount: count.rows[0]!.count,
          simulated: true,
        };
        await saveIdempotentResponse(
          client,
          auth.id,
          'alert-authorize',
          key,
          hash,
          200,
          responseBody,
        );
        return { status: 200, body: responseBody };
      });
      response.status(result.status).json(result.body);
    },
  );

  router.get('/inbox', async (request, response) => {
    const result = await pool.query(
      `SELECT a.id, a.title, a.message, a.precautionary, a.mode,
              d.status AS "deliveryStatus", d.server_received_at AS "serverReceivedAt",
              d.acknowledged_at AS "acknowledgedAt"
       FROM alert_delivery_records d JOIN emergency_alerts a ON a.id = d.alert_id
       WHERE d.recipient_id = $1 ORDER BY d.created_at DESC`,
      [request.auth!.id],
    );
    response.json({ items: result.rows });
  });

  router.post('/:alertId/acknowledge', validateUuidParam('alertId'), async (request, response) => {
    const auth = request.auth!;
    const alertId = request.params.alertId as string;
    const key = requireIdempotencyKey(request.header('idempotency-key'));
    const hash = requestHash({ alertId, action: 'ACKNOWLEDGE' });
    const result = await withTransaction(pool, async (client) => {
      const replay = await getIdempotentResponse(client, auth.id, 'alert-acknowledge', key, hash);
      if (replay) return replay;
      const updated = await client.query<Record<string, unknown>>(
        `UPDATE alert_delivery_records SET status = 'ACKNOWLEDGED', acknowledged_at = now(), updated_at = now()
       WHERE alert_id = $1 AND recipient_id = $2
       RETURNING alert_id AS "alertId", status, acknowledged_at AS "acknowledgedAt"`,
        [alertId, auth.id],
      );
      if (!updated.rows[0]) throw notFound('Alert delivery');
      await saveIdempotentResponse(
        client,
        auth.id,
        'alert-acknowledge',
        key,
        hash,
        200,
        updated.rows[0],
      );
      return { status: 200, body: updated.rows[0] };
    });
    response.status(result.status).json(result.body);
  });

  return router;
}
