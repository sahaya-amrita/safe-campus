import { Router } from 'express';
import { z } from 'zod';
import { writeAudit } from '../audit.js';
import type { Config } from '../config.js';
import type { DatabasePool } from '../db.js';
import { withTransaction } from '../db.js';
import { notFound } from '../errors.js';
import {
  getIdempotentResponse,
  requestHash,
  requireIdempotencyKey,
  saveIdempotentResponse,
} from '../idempotency.js';
import { requireRoles, validateBody, validateUuidParam } from '../middleware.js';

/** A responder-marked impassable area. Bounds keep it on or near the mapped campus. */
export const createRouteBlockSchema = z
  .object({
    longitude: z.number().min(76.88).max(76.92),
    latitude: z.number().min(10.88).max(10.93),
    radiusM: z.number().int().min(5).max(200),
    reason: z.string().trim().min(3).max(200),
  })
  .strict();

const blockColumns = `id, longitude, latitude, radius_m AS "radiusM", reason, mode,
  created_at AS "createdAt", cleared_at AS "clearedAt"`;

export function mapsRouter(pool: DatabasePool, config: Config) {
  const router = Router();

  // Active blocks are shown to everyone so routes avoid them.
  router.get('/blocks', async (_request, response) => {
    const result = await pool.query(
      `SELECT ${blockColumns} FROM route_blocks WHERE cleared_at IS NULL
       ORDER BY created_at DESC LIMIT 200`,
    );
    response.json({ items: result.rows });
  });

  router.post(
    '/blocks',
    requireRoles('RESPONDER', 'ADMIN'),
    validateBody(createRouteBlockSchema),
    async (request, response) => {
      const auth = request.auth!;
      const body = createRouteBlockSchema.parse(request.body);
      const key = requireIdempotencyKey(request.header('idempotency-key'));
      const hash = requestHash(body);
      const result = await withTransaction(pool, async (client) => {
        const replay = await getIdempotentResponse(client, auth.id, 'route-block', key, hash);
        if (replay) return replay;
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO route_blocks (longitude, latitude, radius_m, reason, mode, created_by)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${blockColumns}`,
          [
            body.longitude,
            body.latitude,
            body.radiusM,
            body.reason,
            config.OPERATING_MODE,
            auth.id,
          ],
        );
        const block = inserted.rows[0]!;
        await writeAudit(client, {
          actorId: auth.id,
          action: 'ROUTE_BLOCK_CREATED',
          entityType: 'ROUTE_BLOCK',
          entityId: block.id,
          metadata: { radiusM: body.radiusM, reason: body.reason },
        });
        await saveIdempotentResponse(client, auth.id, 'route-block', key, hash, 201, block);
        return { status: 201, body: block };
      });
      response.status(result.status).json(result.body);
    },
  );

  // Clearing is naturally idempotent: a cleared block stays cleared.
  router.post(
    '/blocks/:blockId/clear',
    validateUuidParam('blockId'),
    requireRoles('RESPONDER', 'ADMIN'),
    async (request, response) => {
      const auth = request.auth!;
      const blockId = request.params.blockId as string;
      const block = await withTransaction(pool, async (client) => {
        const updated = await client.query<{ id: string }>(
          `UPDATE route_blocks SET cleared_at = now(), cleared_by = $2
           WHERE id = $1 AND cleared_at IS NULL RETURNING ${blockColumns}`,
          [blockId, auth.id],
        );
        if (updated.rows[0]) {
          await writeAudit(client, {
            actorId: auth.id,
            action: 'ROUTE_BLOCK_CLEARED',
            entityType: 'ROUTE_BLOCK',
            entityId: blockId,
          });
          return updated.rows[0];
        }
        const existing = await client.query<Record<string, unknown>>(
          `SELECT ${blockColumns} FROM route_blocks WHERE id = $1`,
          [blockId],
        );
        if (!existing.rows[0]) throw notFound('Route block');
        return existing.rows[0];
      });
      response.json(block);
    },
  );

  router.get('/buildings', async (_request, response) => {
    const result = await pool.query(
      `SELECT id, name, mode, geometry_version AS "geometryVersion",
              geometry_approved AS "geometryApproved", metadata
       FROM buildings ORDER BY name LIMIT 200`,
    );
    response.json({ items: result.rows });
  });
  router.get(
    '/:buildingId/approved',
    validateUuidParam('buildingId'),
    async (request, response) => {
      const building = await pool.query<{
        id: string;
        name: string;
        mode: string;
        geometryVersion: string | null;
        geometryApproved: boolean;
        metadata: Record<string, unknown>;
      }>(
        `SELECT id, name, mode, geometry_version AS "geometryVersion",
              geometry_approved AS "geometryApproved", metadata
       FROM buildings WHERE id = $1`,
        [request.params.buildingId],
      );
      if (!building.rows[0]) throw notFound('Building');
      const floors = await pool.query(
        `SELECT f.id, f.name, f.level_number AS "levelNumber",
        COALESCE(json_agg(json_build_object(
          'id', z.id, 'name', z.name, 'zoneCode', z.zone_code,
          'geometry', z.geometry, 'geometryApproved', z.geometry_approved
        )) FILTER (WHERE z.id IS NOT NULL), '[]') zones
       FROM floors f LEFT JOIN zones z ON z.floor_id = f.id
       WHERE f.building_id = $1 GROUP BY f.id ORDER BY f.level_number`,
        [request.params.buildingId],
      );
      response.json({
        ...building.rows[0],
        floors: floors.rows,
        routeGraph: null,
        operationalRoutingAllowed: building.rows[0].geometryApproved === true,
        warning: building.rows[0].geometryApproved
          ? null
          : 'Demonstration geometry is not institution-approved and must not be used for live navigation.',
      });
    },
  );
  return router;
}
