import { Router } from 'express';
import type pg from 'pg';
import type { Logger } from 'pino';
import {
  DEFAULT_SETTINGS,
  settingsSchema,
  updateSettingsSchema,
  type AnalyticsView,
  type SettingsView,
  type SystemSettings,
} from '@sahaya/contracts';
import { z } from 'zod';
import { writeAudit } from '../audit.js';
import type { Config } from '../config.js';
import { withTransaction, type DatabasePool } from '../db.js';
import { ApiError } from '../errors.js';
import { requireRoles, validateBody } from '../middleware.js';

type Queryable = DatabasePool | pg.PoolClient;
const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof SystemSettings)[];

/** Current settings: stored values over the documented DEMO defaults. */
export async function loadSettings(db: Queryable): Promise<SettingsView> {
  const rows = await db.query<{
    key: string;
    value: unknown;
    source: string;
    updated_by: string;
    updated_at: Date;
  }>('SELECT key, value, source, updated_by, updated_at FROM system_settings');
  const values: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const meta = Object.fromEntries(KEYS.map((k) => [k, null])) as SettingsView['meta'];
  for (const row of rows.rows) {
    if (!KEYS.includes(row.key as keyof SystemSettings)) continue;
    values[row.key] = row.value;
    meta[row.key as keyof SystemSettings] = {
      source: row.source,
      updatedAt: new Date(row.updated_at).toISOString(),
      updatedBy: row.updated_by,
    };
  }
  const parsed = settingsSchema.safeParse(values);
  return { values: parsed.success ? parsed.data : DEFAULT_SETTINGS, meta };
}

/** /api/v1/settings (staff read) and /api/v1/admin/settings (ADMIN write). */
export function settingsRouter(pool: DatabasePool) {
  const router = Router();
  router.get(
    '/settings',
    requireRoles('RESPONDER', 'INCIDENT_VERIFIER', 'DRILL_MANAGER', 'ADMIN'),
    async (_request, response) => {
      response.json(await loadSettings(pool));
    },
  );
  router.put(
    '/admin/settings',
    requireRoles('ADMIN'),
    validateBody(updateSettingsSchema),
    async (request, response) => {
      const auth = request.auth!;
      const body = updateSettingsSchema.parse(request.body);
      const result = await withTransaction(pool, async (client) => {
        const before = await loadSettings(client);
        const merged: SystemSettings = settingsSchema.parse({ ...before.values, ...body.values });
        if (merged.escalateAfterSeconds <= merged.ackTargetSeconds)
          throw new ApiError(
            400,
            'VALIDATION_ERROR',
            'Escalation must come after the acknowledgement target',
          );
        for (const [key, value] of Object.entries(body.values)) {
          const exists = await client.query('SELECT 1 FROM system_settings WHERE key = $1', [key]);
          if ((exists.rowCount ?? 0) > 0)
            await client.query(
              `UPDATE system_settings SET value = $2::jsonb, source = $3, updated_by = $4,
                 updated_at = now() WHERE key = $1`,
              [key, JSON.stringify(value), body.source, auth.id],
            );
          else
            await client.query(
              `INSERT INTO system_settings (key, value, source, updated_by)
               VALUES ($1, $2::jsonb, $3, $4)`,
              [key, JSON.stringify(value), body.source, auth.id],
            );
        }
        await writeAudit(client, {
          actorId: auth.id,
          action: 'SETTINGS_UPDATED',
          entityType: 'SETTINGS',
          metadata: {
            changes: Object.fromEntries(
              Object.entries(body.values).map(([k, v]) => [
                k,
                { from: before.values[k as keyof SystemSettings], to: v },
              ]),
            ),
            source: body.source,
            reason: body.reason,
          },
        });
        return loadSettings(client);
      });
      response.json(result);
    },
  );
  return router;
}

const median = (sorted: number[], q = 0.5) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]! : null;

function count<T>(items: T[], key: (item: T) => string | null | undefined) {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item) ?? 'UNSPECIFIED';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/**
 * /api/v1/admin/analytics?days=30 (ADMIN, INCIDENT_VERIFIER). Descriptive
 * counts only: no scores, rankings of people or predictions. In DEMO the
 * data is synthetic and the response says so.
 */
export function analyticsRouter(pool: DatabasePool, config: Config) {
  const router = Router();
  router.get(
    '/admin/analytics',
    requireRoles('ADMIN', 'INCIDENT_VERIFIER'),
    async (request, response) => {
      const parsed = z
        .object({ days: z.coerce.number().int().min(1).max(365).default(30) })
        .safeParse(request.query);
      if (!parsed.success)
        throw new ApiError(400, 'VALIDATION_ERROR', 'Query parameters are invalid');
      const days = parsed.data.days;
      const to = new Date();
      const from = new Date(to.getTime() - days * 86_400_000);
      const settings = (await loadSettings(pool)).values;

      const incidents = (
        await pool.query<{
          category: string | null;
          report_kind: string;
          verification_status: string;
        }>(
          `SELECT category, report_kind, verification_status FROM incidents WHERE created_at >= $1`,
          [from],
        )
      ).rows;
      const helps = (
        await pool.query<{
          source: string;
          status: string;
          created_at: Date;
          acknowledged_at: Date | null;
        }>(
          `SELECT source, status, created_at, acknowledged_at FROM help_requests WHERE created_at >= $1`,
          [from],
        )
      ).rows;
      const ackSeconds = helps
        .filter((h) => h.acknowledged_at)
        .map(
          (h) => (new Date(h.acknowledged_at!).getTime() - new Date(h.created_at).getTime()) / 1000,
        )
        .sort((a, b) => a - b);
      const now = Date.now();
      const overTarget = helps.filter((h) => {
        const end = h.acknowledged_at ? new Date(h.acknowledged_at).getTime() : now;
        return (end - new Date(h.created_at).getTime()) / 1000 > settings.ackTargetSeconds;
      }).length;

      const drills = (
        await pool.query<{ id: string; name: string }>(
          `SELECT id, name FROM drills WHERE created_at >= $1 ORDER BY created_at DESC LIMIT 20`,
          [from],
        )
      ).rows;
      const drillStats: AnalyticsView['drills'] = [];
      for (const d of drills) {
        const checkins = (
          await pool.query<{ student_id: string; status: string; server_received_at: Date }>(
            'SELECT student_id, status, server_received_at FROM student_checkins WHERE drill_id = $1',
            [d.id],
          )
        ).rows;
        const latest = new Map<string, (typeof checkins)[number]>();
        for (const c of checkins) {
          const cur = latest.get(c.student_id);
          if (!cur || new Date(c.server_received_at) > new Date(cur.server_received_at))
            latest.set(c.student_id, c);
        }
        const values = [...latest.values()];
        drillStats.push({
          name: d.name,
          participants: values.length,
          safe: values.filter((v) => v.status === 'CONFIRMED_SAFE').length,
          needHelp: values.filter((v) => v.status === 'HELP_REQUESTED').length,
        });
      }
      const photos = (
        await pool.query<{ status: string }>(
          'SELECT status FROM attachments WHERE created_at >= $1',
          [from],
        )
      ).rows;

      const body: AnalyticsView = {
        window: { from: from.toISOString(), to: to.toISOString(), days },
        dataNote:
          config.OPERATING_MODE === 'DEMO'
            ? 'All data here is synthetic DEMO data. These are descriptive counts only; no prediction is made.'
            : 'Descriptive counts only; no prediction is made. Small numbers can mislead.',
        reports: {
          total: incidents.length,
          byCategory: count(incidents, (i) => i.category),
          byKind: count(incidents, (i) => i.report_kind),
          byVerification: count(incidents, (i) => i.verification_status),
        },
        helpRequests: {
          total: helps.length,
          bySource: count(helps, (h) => h.source),
          byStatus: count(helps, (h) => h.status),
          acknowledged: ackSeconds.length,
          medianAckSeconds: median(ackSeconds) === null ? null : Math.round(median(ackSeconds)!),
          p90AckSeconds:
            median(ackSeconds, 0.9) === null ? null : Math.round(median(ackSeconds, 0.9)!),
          overAckTarget: overTarget,
          ackTargetSeconds: settings.ackTargetSeconds,
        },
        drills: drillStats,
        photos: {
          uploaded: photos.length,
          attached: photos.filter((p) => p.status === 'ATTACHED').length,
        },
      };
      response.json(body);
    },
  );
  return router;
}

/** Deletes uploaded photos never attached to a report after the configured hours. */
export async function purgeUnattachedPhotos(pool: DatabasePool, logger?: Logger): Promise<number> {
  const hours = (await loadSettings(pool)).values.unattachedPhotoHours;
  const cutoff = new Date(Date.now() - hours * 3_600_000);
  return withTransaction(pool, async (client) => {
    const stale = await client.query<{ id: string }>(
      `SELECT id FROM attachments WHERE status = 'STORED' AND created_at < $1`,
      [cutoff],
    );
    for (const row of stale.rows) {
      await client.query('DELETE FROM attachment_blobs WHERE attachment_id = $1', [row.id]);
      await client.query('DELETE FROM attachments WHERE id = $1', [row.id]);
    }
    if (stale.rows.length > 0) {
      await writeAudit(client, {
        action: 'UNATTACHED_PHOTOS_PURGED',
        entityType: 'attachment',
        metadata: { count: stale.rows.length, olderThanHours: hours },
      });
      logger?.info({ count: stale.rows.length }, 'purged unattached photos');
    }
    return stale.rows.length;
  });
}
