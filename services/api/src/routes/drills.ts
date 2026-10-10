import { Router } from 'express';
import type pg from 'pg';
import { createDrillSchema, trainingResultSchema } from '@sahaya/contracts';
import type { DatabasePool } from '../db.js';
import { ApiError, conflict, notFound } from '../errors.js';
import { withTransaction } from '../db.js';
import { requireRoles, validateBody, validateUuidParam } from '../middleware.js';
import {
  getIdempotentResponse,
  requestHash,
  requireIdempotencyKey,
  saveIdempotentResponse,
} from '../idempotency.js';
import { writeAudit } from '../audit.js';

const drillColumns = `id, name, building_id AS "buildingId", scenario_ref AS "scenarioRef",
  scenario_version AS "scenarioVersion", mode, status, assumptions, created_at AS "createdAt",
  started_at AS "startedAt", stopped_at AS "stoppedAt", stop_reason AS "stopReason"`;

const STAFF = ['RESPONDER', 'INCIDENT_VERIFIER', 'DRILL_MANAGER', 'ADMIN'] as const;

/** Open incidents that a person has verified block drills (blueprint §14.2). */
async function liveIncidentCount(client: pg.PoolClient | DatabasePool): Promise<number> {
  const result = await client.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM incidents WHERE verification_status = 'VERIFIED'`,
  );
  return result.rows[0]!.count;
}

/**
 * Ends every ACTIVE drill. Used by the kill switch and automatically when a
 * live incident is verified ("a real incident suspends all drills").
 */
export async function stopActiveDrills(
  client: pg.PoolClient,
  actorId: string,
  reason: 'KILL_SWITCH' | 'LIVE_INCIDENT_VERIFIED',
): Promise<string[]> {
  const stopped = await client.query<{ id: string }>(
    `UPDATE drills SET status = 'COMPLETED', stopped_at = now(), stop_reason = $1,
            updated_at = now()
     WHERE status = 'ACTIVE' RETURNING id`,
    [reason],
  );
  for (const row of stopped.rows) {
    await writeAudit(client, {
      actorId,
      action: 'DRILL_STOPPED',
      entityType: 'DRILL',
      entityId: row.id,
      metadata: { reason },
    });
  }
  return stopped.rows.map((row) => row.id);
}

export function drillsRouter(pool: DatabasePool) {
  const router = Router();
  router.get('/', async (_request, response) => {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT ${drillColumns} FROM drills ORDER BY created_at DESC LIMIT 100`,
    );
    response.json({ items: result.rows });
  });

  // What the drill console checks before a start.
  router.get('/preflight', requireRoles(...STAFF), async (_request, response) => {
    const active = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM drills WHERE status = 'ACTIVE'`,
    );
    const live = await liveIncidentCount(pool);
    response.json({
      verifiedIncidentsOpen: live,
      activeDrills: active.rows[0]!.count,
      canStart: live === 0,
    });
  });

  // Kill switch: any staff member may stop every running drill at once.
  router.post('/stop-all', requireRoles(...STAFF), async (request, response) => {
    const auth = request.auth!;
    const stopped = await withTransaction(pool, (client) =>
      stopActiveDrills(client, auth.id, 'KILL_SWITCH'),
    );
    response.json({ stopped: stopped.length, drillIds: stopped });
  });

  router.post(
    '/:drillId/start',
    validateUuidParam('drillId'),
    requireRoles('DRILL_MANAGER', 'ADMIN'),
    async (request, response) => {
      const auth = request.auth!;
      const drillId = request.params.drillId as string;
      const key = requireIdempotencyKey(request.header('idempotency-key'));
      const hash = requestHash({ drillId, action: 'START' });
      const result = await withTransaction(pool, async (client) => {
        const replay = await getIdempotentResponse(client, auth.id, 'drill-start', key, hash);
        if (replay) return replay;
        const found = await client.query<{ status: string }>(
          'SELECT status FROM drills WHERE id = $1 FOR UPDATE',
          [drillId],
        );
        const status = found.rows[0]?.status;
        if (!status) throw notFound('Drill');
        if (status !== 'DRAFT' && status !== 'AUTHORIZED')
          throw conflict(`A ${status} drill cannot be started`);
        const live = await liveIncidentCount(client);
        if (live > 0)
          throw new ApiError(
            409,
            'LIVE_INCIDENT_ACTIVE',
            'A verified incident is open. Drills cannot start until it is resolved.',
            { verifiedIncidentsOpen: live },
          );
        const updated = await client.query<Record<string, unknown>>(
          `UPDATE drills SET status = 'ACTIVE', started_at = now(), authorized_by = $2,
                  authorized_at = COALESCE(authorized_at, now()), updated_at = now()
           WHERE id = $1 RETURNING ${drillColumns}`,
          [drillId, auth.id],
        );
        await writeAudit(client, {
          actorId: auth.id,
          action: 'DRILL_STARTED',
          entityType: 'DRILL',
          entityId: drillId,
        });
        const body = updated.rows[0];
        await saveIdempotentResponse(client, auth.id, 'drill-start', key, hash, 200, body);
        return { status: 200, body };
      });
      response.status(result.status).json(result.body);
    },
  );

  // Stopping is naturally idempotent: a stopped drill stays stopped.
  router.post(
    '/:drillId/stop',
    validateUuidParam('drillId'),
    requireRoles(...STAFF),
    async (request, response) => {
      const auth = request.auth!;
      const drillId = request.params.drillId as string;
      const drill = await withTransaction(pool, async (client) => {
        const updated = await client.query<Record<string, unknown>>(
          `UPDATE drills SET status = 'COMPLETED', stopped_at = now(),
                  stop_reason = 'STOPPED_BY_CONTROLLER', updated_at = now()
           WHERE id = $1 AND status = 'ACTIVE' RETURNING ${drillColumns}`,
          [drillId],
        );
        if (updated.rows[0]) {
          await writeAudit(client, {
            actorId: auth.id,
            action: 'DRILL_STOPPED',
            entityType: 'DRILL',
            entityId: drillId,
            metadata: { reason: 'STOPPED_BY_CONTROLLER' },
          });
          return updated.rows[0];
        }
        const existing = await client.query<Record<string, unknown>>(
          `SELECT ${drillColumns} FROM drills WHERE id = $1`,
          [drillId],
        );
        if (!existing.rows[0]) throw notFound('Drill');
        return existing.rows[0];
      });
      response.json(drill);
    },
  );
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
  router.get('/results/mine', async (request, response) => {
    const result = await pool.query(
      `SELECT id, drill_id AS "drillId", scenario_ref AS "scenarioRef",
              scenario_version AS "scenarioVersion", score::float, completed_at AS "completedAt"
       FROM training_results WHERE user_id = $1 ORDER BY completed_at DESC LIMIT 50`,
      [request.auth!.id],
    );
    response.json({ items: result.rows });
  });
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
