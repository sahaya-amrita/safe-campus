import type pg from 'pg';
import { loadSettings } from '../routes/adminOps.js';

/**
 * Responder matching for a new help request. Picks up to the configured number
 * (system setting maxMatchedResponders, default three) of verified,
 * AVAILABLE responders, preferring the request's zone (assigned zones, not
 * live GPS), records them and queues a SIMULATED notification for each.
 *
 * Matching never assigns anyone and never tells the student that help is on
 * the way: a responder must acknowledge and accept the request in the app.
 */

export async function matchResponders(
  client: pg.PoolClient,
  helpRequestId: string,
  zoneId: string | null,
): Promise<number> {
  const candidates = await client.query<{ id: string; assigned_zone_id: string | null }>(
    `SELECT id, assigned_zone_id FROM responders
     WHERE verified = true AND availability = 'AVAILABLE'
     ORDER BY created_at, id`,
  );
  const ranked = [
    ...candidates.rows.filter((r) => zoneId && r.assigned_zone_id === zoneId),
    ...candidates.rows.filter((r) => !zoneId || r.assigned_zone_id !== zoneId),
  ].slice(0, (await loadSettings(client)).values.maxMatchedResponders);
  for (const responder of ranked) {
    await client.query(
      `INSERT INTO help_request_notifications (help_request_id, responder_id) VALUES ($1, $2)`,
      [helpRequestId, responder.id],
    );
    await client.query(
      `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
       VALUES ('HELP_REQUEST', $1, 'HELP_REQUEST_NOTIFY_RESPONDER', $2::jsonb)`,
      [
        helpRequestId,
        JSON.stringify({
          responderId: responder.id,
          sameZone: Boolean(zoneId && responder.assigned_zone_id === zoneId),
          simulated: true,
        }),
      ],
    );
  }
  return ranked.length;
}
