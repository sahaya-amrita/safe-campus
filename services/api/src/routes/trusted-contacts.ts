import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { createTrustedContactSchema, updateTrustedContactSchema } from '@sahaya/contracts';
import type { Config } from '../config.js';
import type { DatabasePool } from '../db.js';
import { withTransaction } from '../db.js';
import { notFound } from '../errors.js';
import { validateBody, validateUuidParam } from '../middleware.js';
import {
  getIdempotentResponse,
  requestHash,
  requireIdempotencyKey,
  saveIdempotentResponse,
} from '../idempotency.js';

function encryptContact(config: Config, value: string) {
  const key = createHash('sha256').update(config.JWT_SECRET).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function trustedContactsRouter(pool: DatabasePool, config: Config) {
  const router = Router();
  router.get('/', async (request, response) => {
    const result = await pool.query(
      `SELECT id, name, contact_channel AS "contactChannel", consent,
              notification_preferences AS "notificationPreferences", created_at AS "createdAt"
       FROM trusted_contacts WHERE owner_id = $1 ORDER BY created_at DESC`,
      [request.auth!.id],
    );
    response.json({ items: result.rows });
  });

  router.post('/', validateBody(createTrustedContactSchema), async (request, response) => {
    const body = createTrustedContactSchema.parse(request.body);
    const auth = request.auth!;
    const key = requireIdempotencyKey(request.header('idempotency-key'));
    const hash = requestHash(body);
    const result = await withTransaction(pool, async (client) => {
      const replay = await getIdempotentResponse(
        client,
        auth.id,
        'trusted-contact-create',
        key,
        hash,
      );
      if (replay) return replay;
      const inserted = await client.query<Record<string, unknown>>(
        `INSERT INTO trusted_contacts
        (owner_id, name, contact_channel, contact_value_encrypted, notification_preferences)
       VALUES ($1,$2,$3,$4,$5::jsonb)
       RETURNING id, name, contact_channel AS "contactChannel", consent,
                 notification_preferences AS "notificationPreferences", created_at AS "createdAt"`,
        [
          auth.id,
          body.name,
          body.contactChannel,
          encryptContact(config, body.contactValue),
          JSON.stringify(body.notificationPreferences),
        ],
      );
      const responseBody = { ...inserted.rows[0]!, simulatedNotificationsOnly: true };
      await saveIdempotentResponse(
        client,
        auth.id,
        'trusted-contact-create',
        key,
        hash,
        201,
        responseBody,
      );
      return { status: 201, body: responseBody };
    });
    response.status(result.status).json(result.body);
  });

  router.patch(
    '/:contactId',
    validateUuidParam('contactId'),
    validateBody(updateTrustedContactSchema),
    async (request, response) => {
      const body = updateTrustedContactSchema.parse(request.body);
      const auth = request.auth!;
      const contactId = request.params.contactId as string;
      const key = requireIdempotencyKey(request.header('idempotency-key'));
      const hash = requestHash({ contactId, body });
      const result = await withTransaction(pool, async (client) => {
        const replay = await getIdempotentResponse(
          client,
          auth.id,
          'trusted-contact-update',
          key,
          hash,
        );
        if (replay) return replay;
        const updated = await client.query<Record<string, unknown>>(
          `UPDATE trusted_contacts SET
         consent = COALESCE($3, consent),
         notification_preferences = COALESCE($4::jsonb, notification_preferences),
         updated_at = now()
       WHERE id = $1 AND owner_id = $2
       RETURNING id, name, contact_channel AS "contactChannel", consent,
                 notification_preferences AS "notificationPreferences"`,
          [
            contactId,
            auth.id,
            body.consentStatus ?? null,
            body.notificationPreferences ? JSON.stringify(body.notificationPreferences) : null,
          ],
        );
        if (!updated.rows[0]) throw notFound('Trusted contact');
        const responseBody = updated.rows[0];
        await saveIdempotentResponse(
          client,
          auth.id,
          'trusted-contact-update',
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

  router.delete('/:contactId', validateUuidParam('contactId'), async (request, response) => {
    const auth = request.auth!;
    const contactId = request.params.contactId as string;
    const key = requireIdempotencyKey(request.header('idempotency-key'));
    const hash = requestHash({ contactId, action: 'DELETE' });
    const result = await withTransaction(pool, async (client) => {
      const replay = await getIdempotentResponse(
        client,
        auth.id,
        'trusted-contact-delete',
        key,
        hash,
      );
      if (replay) return replay;
      const deleted = await client.query(
        'DELETE FROM trusted_contacts WHERE id = $1 AND owner_id = $2',
        [contactId, auth.id],
      );
      if (deleted.rowCount === 0) throw notFound('Trusted contact');
      await saveIdempotentResponse(client, auth.id, 'trusted-contact-delete', key, hash, 204, null);
      return { status: 204, body: null };
    });
    response.status(result.status).send();
  });
  return router;
}
