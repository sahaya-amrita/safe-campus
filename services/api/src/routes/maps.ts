import { Router } from 'express';
import type { DatabasePool } from '../db.js';
import { notFound } from '../errors.js';
import { validateUuidParam } from '../middleware.js';

export function mapsRouter(pool: DatabasePool) {
  const router = Router();
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
