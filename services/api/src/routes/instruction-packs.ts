import { Router } from 'express';
import {
  createInstructionPackSchema,
  cursorPaginationSchema,
  instructionPackListQuerySchema,
  reviewInstructionPackSchema,
  type InstructionPackApprovalState,
} from '@sahaya/contracts';
import type { Config } from '../config.js';
import type { DatabasePool } from '../db.js';
import { withTransaction } from '../db.js';
import { writeAudit } from '../audit.js';
import { ApiError, badRequest, conflict, forbidden, notFound } from '../errors.js';
import {
  getIdempotentResponse,
  requestHash,
  requireIdempotencyKey,
  saveIdempotentResponse,
} from '../idempotency.js';
import { requireRoles, validateBody, validateUuidParam } from '../middleware.js';
import { decodeCursor, paginatedResponse } from '../pagination.js';

const selectFields = `
  id, version, language, title, content, content_hash AS "contentHash",
  source_label AS "sourceLabel", source_reference AS "sourceReference",
  approval_state AS "approvalState", review_notes AS "reviewNotes",
  created_by AS "createdBy", reviewed_by AS "reviewedBy",
  approved_at AS "approvedAt", published_by AS "publishedBy",
  published_at AS "publishedAt", expires_at AS "expiresAt", mode,
  created_at AS "createdAt", updated_at AS "updatedAt"`;

export function instructionPacksRouter(pool: DatabasePool, config: Config) {
  const router = Router();

  router.get('/', async (request, response) => {
    const parsed = instructionPackListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Query parameters are invalid',
        parsed.error.flatten(),
      );
    }
    const { language, limit } = parsed.data;
    const cursor = decodeCursor(parsed.data.cursor);
    const values: unknown[] = [];
    const conditions = [
      `approval_state = 'PUBLISHED'`,
      `(expires_at IS NULL OR expires_at > now())`,
    ];
    if (language) {
      values.push(language);
      conditions.push(`language = $${values.length}`);
    }
    if (cursor) {
      values.push(cursor.createdAt, cursor.id);
      conditions.push(
        `(created_at < $${values.length - 1} OR (created_at = $${values.length - 1} AND id < $${values.length}))`,
      );
    }
    values.push(limit + 1);
    const result = await pool.query<{ id: string; createdAt: Date; [key: string]: unknown }>(
      `SELECT ${selectFields} FROM instruction_packs
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC, id DESC LIMIT $${values.length}`,
      values,
    );
    response.json(paginatedResponse(result.rows, limit));
  });

  router.get(
    '/review-queue',
    requireRoles('INCIDENT_VERIFIER', 'ADMIN'),
    async (request, response) => {
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
      const values: unknown[] = [];
      const conditions = [`approval_state <> 'RETIRED'`];
      if (cursor) {
        values.push(cursor.createdAt, cursor.id);
        conditions.push(
          `(created_at < $${values.length - 1} OR (created_at = $${values.length - 1} AND id < $${values.length}))`,
        );
      }
      values.push(parsed.data.limit + 1);
      const result = await pool.query<{ id: string; createdAt: Date; [key: string]: unknown }>(
        `SELECT ${selectFields} FROM instruction_packs
         WHERE ${conditions.join(' AND ')}
         ORDER BY created_at DESC, id DESC LIMIT $${values.length}`,
        values,
      );
      response.json(paginatedResponse(result.rows, parsed.data.limit));
    },
  );

  router.post(
    '/',
    requireRoles('INCIDENT_VERIFIER', 'ADMIN'),
    validateBody(createInstructionPackSchema),
    async (request, response) => {
      const auth = request.auth!;
      const input = createInstructionPackSchema.parse(request.body);
      const key = requireIdempotencyKey(request.header('idempotency-key'));
      const hash = requestHash(input);
      const result = await withTransaction(pool, async (client) => {
        const replay = await getIdempotentResponse(
          client,
          auth.id,
          'instruction-pack-create',
          key,
          hash,
        );
        if (replay) return replay;
        const existing = await client.query(
          'SELECT 1 FROM instruction_packs WHERE version = $1 AND language = $2',
          [input.version, input.language],
        );
        if (existing.rowCount)
          throw conflict('Instruction pack version and language already exist');
        const inserted = await client.query<{ id: string; createdAt: Date }>(
          `INSERT INTO instruction_packs
            (version, language, title, content, content_hash, source_label, source_reference,
             expires_at, mode, created_by)
           VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10)
           RETURNING id, created_at AS "createdAt"`,
          [
            input.version,
            input.language,
            input.title,
            JSON.stringify(input.content),
            input.contentHash,
            input.sourceLabel,
            input.sourceReference ?? null,
            input.expiresAt ?? null,
            config.OPERATING_MODE,
            auth.id,
          ],
        );
        const body = {
          id: inserted.rows[0]!.id,
          version: input.version,
          language: input.language,
          title: input.title,
          contentHash: input.contentHash,
          sourceLabel: input.sourceLabel,
          sourceReference: input.sourceReference ?? null,
          approvalState: 'DRAFT',
          expiresAt: input.expiresAt ?? null,
          mode: config.OPERATING_MODE,
          createdAt: inserted.rows[0]!.createdAt.toISOString(),
        };
        await writeAudit(client, {
          actorId: auth.id,
          action: 'INSTRUCTION_PACK_CREATED',
          entityType: 'INSTRUCTION_PACK',
          entityId: body.id,
          metadata: { version: input.version, language: input.language },
        });
        await saveIdempotentResponse(
          client,
          auth.id,
          'instruction-pack-create',
          key,
          hash,
          201,
          body,
        );
        return { status: 201, body };
      });
      response.status(result.status).json(result.body);
    },
  );

  router.get(
    '/:instructionPackId',
    validateUuidParam('instructionPackId'),
    async (request, response) => {
      const result = await pool.query<{
        approvalState: InstructionPackApprovalState;
        expiresAt: Date | string | null;
        [key: string]: unknown;
      }>(`SELECT ${selectFields} FROM instruction_packs WHERE id = $1`, [
        request.params.instructionPackId,
      ]);
      const pack = result.rows[0];
      if (!pack) throw notFound('Instruction pack');
      const operational =
        request.auth!.roles.includes('INCIDENT_VERIFIER') || request.auth!.roles.includes('ADMIN');
      const unexpired = !pack.expiresAt || new Date(pack.expiresAt).getTime() > Date.now();
      if ((!unexpired || pack.approvalState !== 'PUBLISHED') && !operational) throw forbidden();
      response.json(pack);
    },
  );

  router.post(
    '/:instructionPackId/review',
    validateUuidParam('instructionPackId'),
    requireRoles('INCIDENT_VERIFIER', 'ADMIN'),
    validateBody(reviewInstructionPackSchema),
    async (request, response) => {
      const auth = request.auth!;
      const id = request.params.instructionPackId as string;
      const input = reviewInstructionPackSchema.parse(request.body);
      const key = requireIdempotencyKey(request.header('idempotency-key'));
      const hash = requestHash({ id, input });
      const result = await withTransaction(pool, async (client) => {
        const replay = await getIdempotentResponse(
          client,
          auth.id,
          'instruction-pack-review',
          key,
          hash,
        );
        if (replay) return replay;
        const found = await client.query<{ approval_state: InstructionPackApprovalState }>(
          'SELECT approval_state FROM instruction_packs WHERE id = $1 FOR UPDATE',
          [id],
        );
        const current = found.rows[0]?.approval_state;
        if (!current) throw notFound('Instruction pack');
        if (!['DRAFT', 'REJECTED'].includes(current)) {
          throw badRequest(`Instruction pack cannot be reviewed from ${current}`);
        }
        const next = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        const updated = await client.query<Record<string, unknown>>(
          `UPDATE instruction_packs SET approval_state = $2::instruction_pack_approval_state,
             review_notes = $3, reviewed_by = $4,
             approved_at = CASE
               WHEN $2::instruction_pack_approval_state = 'APPROVED' THEN now()
               ELSE NULL
             END,
             updated_at = now()
           WHERE id = $1
           RETURNING id, approval_state AS "approvalState", review_notes AS "reviewNotes",
             reviewed_by AS "reviewedBy", approved_at AS "approvedAt", updated_at AS "updatedAt"`,
          [id, next, input.notes, auth.id],
        );
        const body = updated.rows[0]!;
        await writeAudit(client, {
          actorId: auth.id,
          action: `INSTRUCTION_PACK_${next}`,
          entityType: 'INSTRUCTION_PACK',
          entityId: id,
          metadata: { from: current, to: next },
        });
        await saveIdempotentResponse(
          client,
          auth.id,
          'instruction-pack-review',
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
    '/:instructionPackId/publish',
    validateUuidParam('instructionPackId'),
    requireRoles('ADMIN'),
    async (request, response) => {
      const auth = request.auth!;
      const id = request.params.instructionPackId as string;
      const key = requireIdempotencyKey(request.header('idempotency-key'));
      const hash = requestHash({ id, action: 'PUBLISH' });
      const result = await withTransaction(pool, async (client) => {
        const replay = await getIdempotentResponse(
          client,
          auth.id,
          'instruction-pack-publish',
          key,
          hash,
        );
        if (replay) return replay;
        const found = await client.query<{ approval_state: InstructionPackApprovalState }>(
          'SELECT approval_state FROM instruction_packs WHERE id = $1 FOR UPDATE',
          [id],
        );
        const current = found.rows[0]?.approval_state;
        if (!current) throw notFound('Instruction pack');
        if (current !== 'APPROVED') {
          throw badRequest(`Instruction pack cannot be published from ${current}`);
        }
        const updated = await client.query<Record<string, unknown>>(
          `UPDATE instruction_packs SET approval_state = 'PUBLISHED', published_by = $2,
             published_at = now(), updated_at = now() WHERE id = $1
           RETURNING id, approval_state AS "approvalState", published_by AS "publishedBy",
             published_at AS "publishedAt", updated_at AS "updatedAt"`,
          [id, auth.id],
        );
        const body = updated.rows[0]!;
        await writeAudit(client, {
          actorId: auth.id,
          action: 'INSTRUCTION_PACK_PUBLISHED',
          entityType: 'INSTRUCTION_PACK',
          entityId: id,
          metadata: { from: current, to: 'PUBLISHED' },
        });
        await saveIdempotentResponse(
          client,
          auth.id,
          'instruction-pack-publish',
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
