import { Router } from 'express';
import type pg from 'pg';
import {
  createResponderSchema,
  setDutySchema,
  updateResponderSchema,
  verifyResponderSchema,
  type ResponderInboxItem,
  type ResponderView,
  type RollCallEntry,
  type RollCallResponse,
  type RollCallStatus,
} from '@sahaya/contracts';
import { z } from 'zod';
import { writeAudit } from '../audit.js';
import type { Config } from '../config.js';
import { withTransaction, type DatabasePool } from '../db.js';
import { ApiError, conflict, forbidden, notFound } from '../errors.js';
import { requireRoles, validateBody, validateUuidParam } from '../middleware.js';

type Queryable = DatabasePool | pg.PoolClient;

interface ResponderRow {
  id: string;
  user_id: string;
  approved_role: string;
  qualifications: string[] | null;
  assigned_zone_id: string | null;
  availability: ResponderView['availability'];
  verified: boolean;
  verified_at: Date | null;
  duty_changed_at: Date | null;
  mode: string;
}

const RESPONDER_COLUMNS = `id, user_id, approved_role, qualifications, assigned_zone_id, availability,
  verified, verified_at, duty_changed_at, mode`;

const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);

/** Placeholders `$from, $from+1, …` for an IN (…) list. */
const placeholders = (count: number, from = 1) =>
  Array.from({ length: count }, (_, i) => `$${i + from}`).join(', ');

async function toViews(db: Queryable, rows: ResponderRow[]): Promise<ResponderView[]> {
  if (rows.length === 0) return [];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const users = await db.query<{ id: string; display_name: string; email: string }>(
    `SELECT id, display_name, email FROM users WHERE id IN (${placeholders(userIds.length)})`,
    userIds,
  );
  const zoneIds = [...new Set(rows.map((r) => r.assigned_zone_id).filter((z) => z !== null))];
  const zones = zoneIds.length
    ? await db.query<{ id: string; name: string }>(
        `SELECT id, name FROM zones WHERE id IN (${placeholders(zoneIds.length)})`,
        zoneIds,
      )
    : { rows: [] as { id: string; name: string }[] };
  const user = new Map(users.rows.map((u) => [u.id, u]));
  const zone = new Map(zones.rows.map((z) => [z.id, z.name]));
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    displayName: user.get(r.user_id)?.display_name ?? 'Unknown',
    email: user.get(r.user_id)?.email ?? '',
    approvedRole: r.approved_role,
    qualifications: r.qualifications ?? [],
    zoneId: r.assigned_zone_id,
    zoneName: r.assigned_zone_id ? (zone.get(r.assigned_zone_id) ?? null) : null,
    availability: r.availability,
    verified: r.verified,
    verifiedAt: iso(r.verified_at),
    dutyChangedAt: iso(r.duty_changed_at),
    mode: r.mode,
  }));
}

async function ownProfile(db: Queryable, userId: string): Promise<ResponderRow> {
  const row = (
    await db.query<ResponderRow>(`SELECT ${RESPONDER_COLUMNS} FROM responders WHERE user_id = $1`, [
      userId,
    ])
  ).rows[0];
  if (!row)
    throw new ApiError(
      404,
      'NO_RESPONDER_PROFILE',
      'No responder profile. An administrator must add you to the roster.',
    );
  return row;
}

/** /api/v1/responders/me: a responder's own profile, duty status and inbox. */
export function responderSelfRouter(pool: DatabasePool) {
  const router = Router();
  router.use(requireRoles('RESPONDER', 'ADMIN'));

  router.get('/', async (request, response) => {
    const [view] = await toViews(pool, [await ownProfile(pool, request.auth!.id)]);
    response.json(view);
  });

  /** Only a verified, AVAILABLE responder is matched to new help requests. */
  router.patch('/duty', validateBody(setDutySchema), async (request, response) => {
    const auth = request.auth!;
    const { availability } = setDutySchema.parse(request.body);
    const view = await withTransaction(pool, async (client) => {
      const profile = await ownProfile(client, auth.id);
      if (profile.availability !== availability) {
        await client.query(
          `UPDATE responders SET availability = $2, duty_changed_at = now(), updated_at = now()
           WHERE id = $1`,
          [profile.id, availability],
        );
        await writeAudit(client, {
          actorId: auth.id,
          action: 'RESPONDER_DUTY_CHANGED',
          entityType: 'RESPONDER',
          entityId: profile.id,
          metadata: { from: profile.availability, to: availability },
        });
      }
      const [updated] = await toViews(client, [await ownProfile(client, auth.id)]);
      return updated;
    });
    response.json(view);
  });

  /** Help requests this responder was matched to (simulated in-app notice). */
  router.get('/inbox', async (request, response) => {
    const profile = await ownProfile(pool, request.auth!.id);
    const notes = await pool.query<{
      help_request_id: string;
      created_at: Date;
      seen_at: Date | null;
    }>(
      `SELECT help_request_id, created_at, seen_at FROM help_request_notifications
       WHERE responder_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [profile.id],
    );
    const ids = notes.rows.map((n) => n.help_request_id);
    const requests = ids.length
      ? await pool.query<{
          id: string;
          status: string;
          priority: string | null;
          source: string;
          category: string | null;
          zone_id: string | null;
        }>(
          `SELECT id, status, priority, source, category, zone_id FROM help_requests
           WHERE id IN (${placeholders(ids.length)})`,
          ids,
        )
      : { rows: [] };
    const byId = new Map(requests.rows.map((r) => [r.id, r]));
    const items: ResponderInboxItem[] = notes.rows
      .filter((n) => byId.has(n.help_request_id))
      .map((n) => {
        const help = byId.get(n.help_request_id)!;
        return {
          helpRequestId: help.id,
          status: help.status,
          priority: help.priority,
          source: help.source,
          category: help.category,
          sameZone: help.zone_id !== null && help.zone_id === profile.assigned_zone_id,
          matchedAt: iso(n.created_at)!,
          seenAt: iso(n.seen_at),
        };
      });
    response.json({
      items,
      unseen: items.filter((i) => !i.seenAt && (i.status === 'OPEN' || i.status === 'ACKNOWLEDGED'))
        .length,
      note: 'In-app notices only (DEMO). Nothing was sent to a phone, pager or radio.',
    });
  });

  router.post(
    '/inbox/seen',
    validateBody(z.object({ helpRequestIds: z.array(z.string().uuid()).min(1).max(50) })),
    async (request, response) => {
      const profile = await ownProfile(pool, request.auth!.id);
      const { helpRequestIds } = request.body as { helpRequestIds: string[] };
      await pool.query(
        `UPDATE help_request_notifications SET seen_at = now()
         WHERE responder_id = $1 AND seen_at IS NULL
           AND help_request_id IN (${placeholders(helpRequestIds.length, 2)})`,
        [profile.id, ...helpRequestIds],
      );
      response.status(204).end();
    },
  );

  return router;
}

/** /api/v1/admin/responders: the roster (ADMIN). Every change needs a reason and is audited. */
export function adminRespondersRouter(pool: DatabasePool, config: Config) {
  const router = Router();
  router.use(requireRoles('ADMIN'));

  router.get('/', async (_request, response) => {
    const rows = await pool.query<ResponderRow>(
      `SELECT ${RESPONDER_COLUMNS} FROM responders ORDER BY created_at, id`,
    );
    const zones = await pool.query<{ id: string; name: string; zone_code: string }>(
      'SELECT id, name, zone_code FROM zones ORDER BY name',
    );
    response.json({
      items: await toViews(pool, rows.rows),
      zones: zones.rows.map((z) => ({ id: z.id, name: z.name, code: z.zone_code })),
    });
  });

  router.post('/', validateBody(createResponderSchema), async (request, response) => {
    const auth = request.auth!;
    const body = createResponderSchema.parse(request.body);
    const view = await withTransaction(pool, async (client) => {
      const roles = await client.query<{ role: string }>(
        'SELECT role FROM user_roles WHERE user_id = $1',
        [body.userId],
      );
      if (roles.rowCount === 0) throw notFound('User');
      if (!roles.rows.some((r) => r.role === 'RESPONDER'))
        throw conflict('Grant the RESPONDER role in Users and roles first');
      const existing = await client.query('SELECT 1 FROM responders WHERE user_id = $1', [
        body.userId,
      ]);
      if ((existing.rowCount ?? 0) > 0) throw conflict('This user already has a responder profile');
      if (body.zoneId) {
        const zone = await client.query('SELECT 1 FROM zones WHERE id = $1', [body.zoneId]);
        if (zone.rowCount === 0) throw notFound('Zone');
      }
      // New profiles start unverified and off duty: they are never matched
      // until an administrator verifies them and they go on duty.
      const row = (
        await client.query<ResponderRow>(
          `INSERT INTO responders (user_id, approved_role, qualifications, assigned_zone_id,
             availability, contact_channel, verified, mode)
           VALUES ($1, $2, $3, $4, 'OFF_DUTY', 'IN_APP', false, $5)
           RETURNING ${RESPONDER_COLUMNS}`,
          [
            body.userId,
            body.approvedRole,
            body.qualifications,
            body.zoneId ?? null,
            config.OPERATING_MODE,
          ],
        )
      ).rows[0]!;
      await writeAudit(client, {
        actorId: auth.id,
        action: 'RESPONDER_PROFILE_CREATED',
        entityType: 'RESPONDER',
        entityId: row.id,
        metadata: {
          userId: body.userId,
          approvedRole: body.approvedRole,
          zoneId: body.zoneId ?? null,
          reason: body.reason,
        },
      });
      return (await toViews(client, [row]))[0];
    });
    response.status(201).json(view);
  });

  router.patch(
    '/:responderId',
    validateUuidParam('responderId'),
    validateBody(updateResponderSchema),
    async (request, response) => {
      const auth = request.auth!;
      const id = request.params.responderId as string;
      const body = updateResponderSchema.parse(request.body);
      const view = await withTransaction(pool, async (client) => {
        const before = (
          await client.query<ResponderRow>(
            `SELECT ${RESPONDER_COLUMNS} FROM responders WHERE id = $1`,
            [id],
          )
        ).rows[0];
        if (!before) throw notFound('Responder');
        if (body.zoneId) {
          const zone = await client.query('SELECT 1 FROM zones WHERE id = $1', [body.zoneId]);
          if (zone.rowCount === 0) throw notFound('Zone');
        }
        await client.query(
          `UPDATE responders SET approved_role = $2, qualifications = $3, assigned_zone_id = $4,
             updated_at = now() WHERE id = $1`,
          [
            id,
            body.approvedRole ?? before.approved_role,
            body.qualifications ?? before.qualifications ?? [],
            body.zoneId === undefined ? before.assigned_zone_id : body.zoneId,
          ],
        );
        await writeAudit(client, {
          actorId: auth.id,
          action: 'RESPONDER_PROFILE_UPDATED',
          entityType: 'RESPONDER',
          entityId: id,
          metadata: {
            reason: body.reason,
            changes: Object.keys(body).filter((k) => k !== 'reason'),
            zoneFrom: before.assigned_zone_id,
          },
        });
        const after = (
          await client.query<ResponderRow>(
            `SELECT ${RESPONDER_COLUMNS} FROM responders WHERE id = $1`,
            [id],
          )
        ).rows[0]!;
        return (await toViews(client, [after]))[0];
      });
      response.json(view);
    },
  );

  router.post(
    '/:responderId/verification',
    validateUuidParam('responderId'),
    validateBody(verifyResponderSchema),
    async (request, response) => {
      const auth = request.auth!;
      const id = request.params.responderId as string;
      const { verified, reason } = verifyResponderSchema.parse(request.body);
      const view = await withTransaction(pool, async (client) => {
        const before = (
          await client.query<ResponderRow>(
            `SELECT ${RESPONDER_COLUMNS} FROM responders WHERE id = $1`,
            [id],
          )
        ).rows[0];
        if (!before) throw notFound('Responder');
        if (before.user_id === auth.id)
          throw conflict('You cannot verify your own responder profile');
        // Removing verification also takes the responder off duty.
        await client.query(
          `UPDATE responders SET verified = $2,
             verified_by = CASE WHEN $2 THEN $3::uuid ELSE NULL END,
             verified_at = CASE WHEN $2 THEN now() ELSE NULL END,
             availability = CASE WHEN $2 THEN availability ELSE 'OFF_DUTY' END,
             updated_at = now()
           WHERE id = $1`,
          [id, verified, auth.id],
        );
        await writeAudit(client, {
          actorId: auth.id,
          action: verified ? 'RESPONDER_VERIFIED' : 'RESPONDER_VERIFICATION_REMOVED',
          entityType: 'RESPONDER',
          entityId: id,
          metadata: { reason },
        });
        const after = (
          await client.query<ResponderRow>(
            `SELECT ${RESPONDER_COLUMNS} FROM responders WHERE id = $1`,
            [id],
          )
        ).rows[0]!;
        return (await toViews(client, [after]))[0];
      });
      response.json(view);
    },
  );

  return router;
}

const ROLL_CALL_NOTE =
  'NO_RESPONSE means no server-received check-in yet. It does not mean someone is hurt or absent; follow up in person or by phone.';

/**
 * /api/v1/roll-call: per-person safety status for an incident or drill.
 * Eligible people are students with a zone membership in the scope (the
 * incident's zone, or every zone of the drill's building), plus anyone who
 * checked in. Names are shown to staff only; RESPONDER-only accounts see a
 * scope only when it includes their assigned zone. Every view is audited.
 */
export function rollCallRouter(pool: DatabasePool) {
  const router = Router();
  router.use(requireRoles('RESPONDER', 'INCIDENT_VERIFIER', 'DRILL_MANAGER', 'ADMIN'));

  async function build(
    request: Parameters<Parameters<typeof router.get>[1]>[0],
    kind: 'incident' | 'drill',
  ): Promise<RollCallResponse> {
    const auth = request.auth!;
    const id = request.params.id as string;
    let zoneIds: string[] = [];
    if (kind === 'incident') {
      const incident = (
        await pool.query<{ zone_id: string | null }>(
          'SELECT zone_id FROM incidents WHERE id = $1',
          [id],
        )
      ).rows[0];
      if (!incident) throw notFound('Incident');
      zoneIds = incident.zone_id ? [incident.zone_id] : [];
    } else {
      const drill = (
        await pool.query<{ building_id: string }>('SELECT building_id FROM drills WHERE id = $1', [
          id,
        ])
      ).rows[0];
      if (!drill) throw notFound('Drill');
      const floors = await pool.query<{ id: string }>(
        'SELECT id FROM floors WHERE building_id = $1',
        [drill.building_id],
      );
      if (floors.rows.length) {
        const zones = await pool.query<{ id: string }>(
          `SELECT id FROM zones WHERE floor_id IN (${placeholders(floors.rows.length)})`,
          floors.rows.map((f) => f.id),
        );
        zoneIds = zones.rows.map((z) => z.id);
      }
    }

    const wide = ['ADMIN', 'INCIDENT_VERIFIER', 'DRILL_MANAGER'].some((r) =>
      auth.roles.includes(r as never),
    );
    if (!wide) {
      const responder = (
        await pool.query<{ assigned_zone_id: string | null }>(
          'SELECT assigned_zone_id FROM responders WHERE user_id = $1 AND verified = true',
          [auth.id],
        )
      ).rows[0];
      if (!responder?.assigned_zone_id || !zoneIds.includes(responder.assigned_zone_id))
        throw forbidden('Roll call is limited to your assigned zone');
    }

    const members = zoneIds.length
      ? await pool.query<{ user_id: string }>(
          `SELECT user_id FROM zone_memberships WHERE zone_id IN (${placeholders(zoneIds.length)})`,
          zoneIds,
        )
      : { rows: [] as { user_id: string }[] };
    const column = kind === 'incident' ? 'incident_id' : 'drill_id';
    const checkins = await pool.query<{
      student_id: string;
      status: 'CONFIRMED_SAFE' | 'HELP_REQUESTED';
      server_received_at: Date;
    }>(`SELECT student_id, status, server_received_at FROM student_checkins WHERE ${column} = $1`, [
      id,
    ]);
    const helps = await pool.query<{
      id: string;
      student_id: string;
      status: string;
      created_at: Date;
    }>(`SELECT id, student_id, status, created_at FROM help_requests WHERE ${column} = $1`, [id]);

    const latest = new Map<string, (typeof checkins.rows)[number]>();
    for (const row of checkins.rows) {
      const current = latest.get(row.student_id);
      if (!current || new Date(row.server_received_at) > new Date(current.server_received_at))
        latest.set(row.student_id, row);
    }
    const latestHelp = new Map<string, (typeof helps.rows)[number]>();
    for (const row of helps.rows) {
      const current = latestHelp.get(row.student_id);
      if (!current || new Date(row.created_at) > new Date(current.created_at))
        latestHelp.set(row.student_id, row);
    }

    const memberIds = new Set(members.rows.map((m) => m.user_id));
    const candidateIds = [...new Set([...memberIds, ...latest.keys()])];
    // Only students are on the roll call, never staff who share a zone.
    const studentRoles = candidateIds.length
      ? await pool.query<{ user_id: string }>(
          `SELECT user_id FROM user_roles WHERE role = 'STUDENT'
           AND user_id IN (${placeholders(candidateIds.length)})`,
          candidateIds,
        )
      : { rows: [] as { user_id: string }[] };
    const studentIds = studentRoles.rows.map((r) => r.user_id);
    const names = studentIds.length
      ? await pool.query<{ id: string; display_name: string }>(
          `SELECT id, display_name FROM users WHERE id IN (${placeholders(studentIds.length)})`,
          studentIds,
        )
      : { rows: [] as { id: string; display_name: string }[] };
    const name = new Map(names.rows.map((n) => [n.id, n.display_name]));

    const order: Record<RollCallStatus, number> = { NEEDS_HELP: 0, NO_RESPONSE: 1, SAFE: 2 };
    const items: RollCallEntry[] = studentIds
      .map((studentId) => {
        const checkin = latest.get(studentId);
        const help = latestHelp.get(studentId);
        const status: RollCallStatus = !checkin
          ? 'NO_RESPONSE'
          : checkin.status === 'HELP_REQUESTED'
            ? 'NEEDS_HELP'
            : 'SAFE';
        return {
          studentId,
          displayName: name.get(studentId) ?? 'Unknown',
          status,
          lastCheckInAt: checkin ? iso(checkin.server_received_at) : null,
          helpRequestId: help?.id ?? null,
          helpRequestStatus: help?.status ?? null,
        };
      })
      .sort(
        (a, b) => order[a.status] - order[b.status] || a.displayName.localeCompare(b.displayName),
      );
    const counts: Record<RollCallStatus, number> = { SAFE: 0, NEEDS_HELP: 0, NO_RESPONSE: 0 };
    for (const item of items) counts[item.status] += 1;

    await withTransaction(pool, (client) =>
      writeAudit(client, {
        actorId: auth.id,
        action: 'ROLL_CALL_VIEWED',
        entityType: kind === 'incident' ? 'INCIDENT' : 'DRILL',
        entityId: id,
        metadata: { people: items.length },
      }),
    );
    return { scope: { kind, id, zoneCount: zoneIds.length }, counts, items, note: ROLL_CALL_NOTE };
  }

  router.get('/incidents/:id', validateUuidParam('id'), async (request, response) => {
    response.json(await build(request, 'incident'));
  });
  router.get('/drills/:id', validateUuidParam('id'), async (request, response) => {
    response.json(await build(request, 'drill'));
  });
  return router;
}
