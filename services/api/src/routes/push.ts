import { Router } from 'express';
import {
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  type PushConfigView,
} from '@sahaya/contracts';
import { writeAudit } from '../audit.js';
import { pushSettings, type Config } from '../config.js';
import { withTransaction, type DatabasePool } from '../db.js';
import { ApiError } from '../errors.js';
import { requireRoles, validateBody } from '../middleware.js';
import { isAllowedPushEndpoint } from '../notifications/push.js';

/**
 * /api/v1/push (Phase 8): responders register this device for matched-request
 * notices. Push is off unless the server has VAPID keys; the in-app inbox is
 * always the record. Endpoints are capability URLs, so only their host is
 * written to the audit log.
 */
export function pushRouter(pool: DatabasePool, config: Config) {
  const router = Router();
  const settings = pushSettings(config);

  const devices = async (userId: string) =>
    (
      await pool.query<{ id: string }>(
        'SELECT id FROM push_subscriptions WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
      )
    ).rows.length;

  router.get('/config', async (request, response) => {
    const body: PushConfigView = {
      enabled: settings.enabled,
      publicKey: settings.publicKey,
      devices: await devices(request.auth!.id),
      note: settings.enabled
        ? 'Phone notices only say a help request was matched to you. Your in-app inbox is the record; check it on duty.'
        : 'Phone notices are not set up on this server. Matched requests appear in your in-app inbox.',
    };
    response.json(body);
  });

  router.post(
    '/subscriptions',
    requireRoles('RESPONDER'),
    validateBody(pushSubscriptionSchema),
    async (request, response) => {
      if (!settings.enabled)
        throw new ApiError(409, 'PUSH_DISABLED', 'Phone notices are not set up on this server');
      const body = pushSubscriptionSchema.parse(request.body);
      if (!isAllowedPushEndpoint(body.endpoint))
        throw new ApiError(
          400,
          'PUSH_ENDPOINT_NOT_ALLOWED',
          'This browser push service is not supported',
        );
      const userId = request.auth!.id;
      await withTransaction(pool, async (client) => {
        // One row per endpoint: re-registering a device moves it to this account.
        await client.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [body.endpoint]);
        await client.query(
          `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth_secret)
           VALUES ($1, $2, $3, $4)`,
          [userId, body.endpoint, body.keys.p256dh, body.keys.auth],
        );
        await writeAudit(client, {
          actorId: userId,
          action: 'PUSH_DEVICE_REGISTERED',
          entityType: 'user',
          entityId: userId,
          metadata: { pushHost: new URL(body.endpoint).hostname },
        });
      });
      response.status(201).json({ devices: await devices(userId) });
    },
  );

  router.post(
    '/subscriptions/remove',
    validateBody(pushUnsubscribeSchema),
    async (request, response) => {
      const body = pushUnsubscribeSchema.parse(request.body);
      const userId = request.auth!.id;
      await withTransaction(pool, async (client) => {
        const removed = await client.query(
          `UPDATE push_subscriptions SET revoked_at = now()
           WHERE endpoint = $1 AND user_id = $2 AND revoked_at IS NULL`,
          [body.endpoint, userId],
        );
        if ((removed.rowCount ?? 0) > 0)
          await writeAudit(client, {
            actorId: userId,
            action: 'PUSH_DEVICE_REMOVED',
            entityType: 'user',
            entityId: userId,
          });
      });
      response.json({ devices: await devices(userId) });
    },
  );

  return router;
}
