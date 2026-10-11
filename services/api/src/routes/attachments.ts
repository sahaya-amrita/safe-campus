import { createHash } from 'node:crypto';
import express, { Router } from 'express';
import type pg from 'pg';
import {
  MAX_ATTACHMENTS_PER_REPORT,
  MAX_ATTACHMENT_BYTES,
  type AttachmentView,
} from '@sahaya/contracts';
import { writeAudit } from '../audit.js';
import { withTransaction, type DatabasePool } from '../db.js';
import { ApiError, forbidden, notFound } from '../errors.js';
import { validateUuidParam } from '../middleware.js';
import { sanitizeImage } from '../reporting/images.js';

/** Unattached uploads one account may hold at once (limits abuse of storage). */
const MAX_UNATTACHED_PER_OWNER = 20;
const STAFF_ROLES = ['RESPONDER', 'INCIDENT_VERIFIER', 'ADMIN'] as const;

interface AttachmentRow {
  id: string;
  media_type: 'image/jpeg' | 'image/png';
  size_bytes: number;
  sha256: string;
  status: 'STORED' | 'ATTACHED';
  created_at: Date;
}

function view(row: AttachmentRow): AttachmentView {
  return {
    id: row.id,
    mediaType: row.media_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * Links the owner's uploaded photos to a help request or an incident report.
 * Every id must belong to the owner and be unattached (or already linked to
 * the same target); the target may hold at most three photos.
 */
export async function linkAttachments(
  client: pg.PoolClient,
  ownerId: string,
  ids: readonly string[],
  target: { helpRequestId: string } | { incidentReportId: string },
): Promise<string[]> {
  if (ids.length === 0) return [];
  const column = 'helpRequestId' in target ? 'help_request_id' : 'incident_report_id';
  const targetId = 'helpRequestId' in target ? target.helpRequestId : target.incidentReportId;
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const rows = (
    await client.query<{
      id: string;
      owner_id: string;
      help_request_id: string | null;
      incident_report_id: string | null;
    }>(
      `SELECT id, owner_id, help_request_id, incident_report_id FROM attachments
       WHERE id IN (${placeholders})`,
      [...ids],
    )
  ).rows;
  if (rows.length !== ids.length || rows.some((r) => r.owner_id !== ownerId))
    throw new ApiError(400, 'ATTACHMENT_NOT_FOUND', 'One or more photos were not found');
  const toLink = rows.filter((r) => {
    const linked = column === 'help_request_id' ? r.help_request_id : r.incident_report_id;
    if (linked === targetId) return false;
    if (r.help_request_id || r.incident_report_id)
      throw new ApiError(409, 'ATTACHMENT_IN_USE', 'A photo is already attached elsewhere');
    return true;
  });
  const existing = await client.query<{ count: string | number }>(
    `SELECT count(*) AS count FROM attachments WHERE ${column} = $1`,
    [targetId],
  );
  if (Number(existing.rows[0]?.count ?? 0) + toLink.length > MAX_ATTACHMENTS_PER_REPORT)
    throw new ApiError(
      400,
      'TOO_MANY_ATTACHMENTS',
      `At most ${MAX_ATTACHMENTS_PER_REPORT} photos per report`,
    );
  for (const row of toLink)
    await client.query(
      `UPDATE attachments SET status = 'ATTACHED', ${column} = $2, attached_at = now()
       WHERE id = $1`,
      [row.id, targetId],
    );
  return toLink.map((r) => r.id);
}

/** Photos attached to help requests or incident reports, keyed by that target id. */
export async function attachmentsFor(
  pool: DatabasePool,
  column: 'help_request_id' | 'incident_report_id',
  targetIds: readonly string[],
): Promise<Map<string, AttachmentView[]>> {
  const result = new Map<string, AttachmentView[]>();
  if (targetIds.length === 0) return result;
  const placeholders = targetIds.map((_, i) => `$${i + 1}`).join(', ');
  const rows = await pool.query<AttachmentRow & { target: string }>(
    `SELECT id, media_type, size_bytes, sha256, status, created_at, ${column} AS target
     FROM attachments WHERE ${column} IN (${placeholders}) ORDER BY created_at, id`,
    [...targetIds],
  );
  for (const row of rows.rows) {
    const list = result.get(row.target) ?? [];
    list.push(view(row));
    result.set(row.target, list);
  }
  return result;
}

export function attachmentsRouter(pool: DatabasePool) {
  const router = Router();

  router.post(
    '/',
    express.raw({
      type: ['image/jpeg', 'image/png', 'application/octet-stream'],
      limit: MAX_ATTACHMENT_BYTES + 1024,
    }),
    async (request, response) => {
      const auth = request.auth!;
      const body: unknown = request.body;
      if (!Buffer.isBuffer(body) || body.length === 0)
        throw new ApiError(400, 'VALIDATION_ERROR', 'Send the image bytes as the request body');
      const clean = sanitizeImage(body);
      if (!clean)
        throw new ApiError(415, 'UNSUPPORTED_MEDIA', 'Only JPEG and PNG photos are accepted');
      if (clean.bytes.length > MAX_ATTACHMENT_BYTES)
        throw new ApiError(413, 'ATTACHMENT_TOO_LARGE', 'Photos must be 5 MB or smaller');
      const sha256 = createHash('sha256').update(clean.bytes).digest('hex');

      const result = await withTransaction(pool, async (client) => {
        const existing = (
          await client.query<AttachmentRow>(
            `SELECT id, media_type, size_bytes, sha256, status, created_at FROM attachments
             WHERE owner_id = $1 AND sha256 = $2`,
            [auth.id, sha256],
          )
        ).rows[0];
        if (existing) return { status: 200, body: view(existing) };
        const pending = await client.query<{ count: string | number }>(
          `SELECT count(*) AS count FROM attachments WHERE owner_id = $1 AND status = 'STORED'`,
          [auth.id],
        );
        if (Number(pending.rows[0]?.count ?? 0) >= MAX_UNATTACHED_PER_OWNER)
          throw new ApiError(
            429,
            'TOO_MANY_UPLOADS',
            'Too many unattached photos. Send or remove some first.',
          );
        const inserted = (
          await client.query<AttachmentRow>(
            `INSERT INTO attachments (owner_id, media_type, size_bytes, sha256)
             VALUES ($1, $2, $3, $4)
             RETURNING id, media_type, size_bytes, sha256, status, created_at`,
            [auth.id, clean.type, clean.bytes.length, sha256],
          )
        ).rows[0]!;
        await client.query(
          'INSERT INTO attachment_blobs (attachment_id, data_base64) VALUES ($1, $2)',
          [inserted.id, Buffer.from(clean.bytes).toString('base64')],
        );
        await writeAudit(client, {
          actorId: auth.id,
          action: 'ATTACHMENT_UPLOADED',
          entityType: 'attachment',
          entityId: inserted.id,
          metadata: { mediaType: clean.type, sizeBytes: clean.bytes.length },
        });
        return { status: 201, body: view(inserted) };
      });
      response.status(result.status).json(result.body);
    },
  );

  router.get(
    '/:attachmentId/content',
    validateUuidParam('attachmentId'),
    async (request, response) => {
      const auth = request.auth!;
      const id = request.params.attachmentId as string;
      const row = (
        await pool.query<{
          owner_id: string;
          media_type: string;
          help_request_id: string | null;
          incident_report_id: string | null;
        }>(
          `SELECT owner_id, media_type, help_request_id, incident_report_id
         FROM attachments WHERE id = $1`,
          [id],
        )
      ).rows[0];
      if (!row) throw notFound('Photo');

      const owner = row.owner_id === auth.id;
      if (!owner) {
        const staff = STAFF_ROLES.some((role) => auth.roles.includes(role));
        const attached = row.help_request_id !== null || row.incident_report_id !== null;
        if (!staff || !attached) throw notFound('Photo');
        // Responders without a wider role see help-request photos only for
        // requests in their zone, assigned to them, or notified to them.
        const wide = auth.roles.includes('ADMIN') || auth.roles.includes('INCIDENT_VERIFIER');
        if (!wide && row.help_request_id) {
          const responder = (
            await pool.query<{ id: string; assigned_zone_id: string | null }>(
              'SELECT id, assigned_zone_id FROM responders WHERE user_id = $1',
              [auth.id],
            )
          ).rows[0];
          const help = (
            await pool.query<{ zone_id: string | null; assigned_responder_id: string | null }>(
              'SELECT zone_id, assigned_responder_id FROM help_requests WHERE id = $1',
              [row.help_request_id],
            )
          ).rows[0];
          const notified = responder
            ? await pool.query(
                `SELECT 1 FROM help_request_notifications
               WHERE help_request_id = $1 AND responder_id = $2`,
                [row.help_request_id, responder.id],
              )
            : null;
          const allowed =
            responder &&
            help &&
            ((help.zone_id !== null && help.zone_id === responder.assigned_zone_id) ||
              help.assigned_responder_id === responder.id ||
              (notified?.rowCount ?? 0) > 0);
          if (!allowed) throw forbidden();
        }
        await withTransaction(pool, (client) =>
          writeAudit(client, {
            actorId: auth.id,
            action: 'ATTACHMENT_VIEWED',
            entityType: 'attachment',
            entityId: id,
            metadata: {
              helpRequestId: row.help_request_id,
              incidentReportId: row.incident_report_id,
            },
          }),
        );
      }
      const blob = (
        await pool.query<{ data_base64: string }>(
          'SELECT data_base64 FROM attachment_blobs WHERE attachment_id = $1',
          [id],
        )
      ).rows[0];
      if (!blob) throw notFound('Photo');
      response
        .status(200)
        .setHeader('Content-Type', row.media_type)
        .setHeader('Cache-Control', 'private, no-store')
        .setHeader('Content-Disposition', 'inline')
        .send(Buffer.from(blob.data_base64, 'base64'));
    },
  );

  return router;
}
