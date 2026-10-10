import { Router } from 'express';
import { createDrillSchema, trainingResultSchema } from '@sahaya/contracts';
import type { DatabasePool } from '../db.js';
import { withTransaction } from '../db.js';
import { requireRoles, validateBody, validateUuidParam } from '../middleware.js';
import {
  getIdempotentResponse,
  requestHash,
  requireIdempotencyKey,
  saveIdempotentResponse,
} from '../idempotency.js';
import { writeAudit } from '../audit.js';

export function drillsRouter(pool: DatabasePool) {
  const router = Router();
  router.get('/', async (_request, response) => {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT id, name, building_id AS "buildingId", scenario_ref AS "scenarioRef",
              scenario_version AS "scenarioVersion", mode, status, assumptions,
              created_at AS "createdAt" FROM drills ORDER BY created_at DESC LIMIT 100`,
    );
    response.json({ items: result.rows });
  });
  router.post(
    '/',
    requireRoles('DRILL_MANAGER', 'ADMIN'),
    validateBody(createDrillSchema),
    async (request, response) => {
      const body = createDrillSchema.parse(request.body);
      const auth = request.auth!;
      const key = requireIdempotencyKey(request.header('idempotency-key'));
      const hash = requestHash(body);
      const result = await withTransaction(pool, async (client) => {
        const replay = await getIdempotentResponse(client, auth.id, 'drill-create', key, hash);
        if (replay) return replay;
        const inserted = await client.query<Record<string, unknown>>(
          `INSERT INTO drills
        (name, building_id, scenario_ref, scenario_version, mode, assumptions, created_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
       RETURNING id, name, building_id AS "buildingId", scenario_ref AS "scenarioRef",
                 scenario_version AS "scenarioVersion", mode, status, assumptions`,
          [
            body.name,
            body.buildingId,
            body.scenarioRef,
            body.scenarioVersion,
            body.mode,
            JSON.stringify(body.assumptions),
            auth.id,
          ],
        );
        const responseBody = inserted.rows[0];
        await writeAudit(client, {
          actorId: auth.id,
          action: 'DRILL_CREATED',
          entityType: 'DRILL',
          entityId: String(responseBody!.id),
          metadata: { mode: body.mode, scenarioRef: body.scenarioRef },
        });
        await saveIdempotentResponse(client, auth.id, 'drill-create', key, hash, 201, responseBody);
        return { status: 201, body: responseBody };
      });
      response.status(result.status).json(result.body);
    },
  );
  router.get(
    '/:drillId/metrics',
    validateUuidParam('drillId'),
    requireRoles('DRILL_MANAGER', 'ADMIN'),
    async (request, response) => {
      const result = await pool.query<{
        participants: number;
        confirmed_safe: number;
        help_requested: number;
      }>(
        `SELECT
         count(*)::int AS participants,
         count(*) FILTER (WHERE latest.status = 'CONFIRMED_SAFE')::int AS confirmed_safe,
         count(*) FILTER (WHERE latest.status = 'HELP_REQUESTED')::int AS help_requested
       FROM (
         SELECT DISTINCT ON (student_id) student_id, status
         FROM student_checkins WHERE drill_id = $1 ORDER BY student_id, server_received_at DESC
       ) latest`,
        [request.params.drillId],
      );
      const training = await pool.query<{ completions: number; average_score: number }>(
        'SELECT count(*)::int completions, COALESCE(avg(score),0)::float average_score FROM training_results WHERE drill_id = $1',
        [request.params.drillId],
      );
      response.json({
        drillId: request.params.drillId,
        checkins: result.rows[0],
        training: training.rows[0],
        assumptionsAreSynthetic: true,
      });
    },
  );
  return router;
}

export function trainingRouter(pool: DatabasePool) {
  const router = Router();
  router.post('/results', validateBody(trainingResultSchema), async (request, response) => {
    const body = trainingResultSchema.parse(request.body);
    const auth = request.auth!;
    const key = requireIdempotencyKey(request.header('idempotency-key'));
    const hash = requestHash(body);
    const result = await withTransaction(pool, async (client) => {
      const replay = await getIdempotentResponse(
        client,
        auth.id,
        'training-result-create',
        key,
        hash,
      );
      if (replay) return replay;
      const inserted = await client.query<Record<string, unknown>>(
        `INSERT INTO training_results
        (user_id, drill_id, scenario_ref, scenario_version, score, answers)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)
       RETURNING id, drill_id AS "drillId", scenario_ref AS "scenarioRef",
                 scenario_version AS "scenarioVersion", score::float, completed_at AS "completedAt"`,
        [
          auth.id,
          body.drillId ?? null,
          body.scenarioRef,
          body.scenarioVersion,
          body.score,
          JSON.stringify(body.answers),
        ],
      );
      const responseBody = inserted.rows[0];
      await saveIdempotentResponse(
        client,
        auth.id,
        'training-result-create',
        key,
        hash,
        201,
        responseBody,
      );
      return { status: 201, body: responseBody };
    });
    response.status(result.status).json(result.body);
  });
  return router;
}
