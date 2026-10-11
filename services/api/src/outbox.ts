import type { Logger } from 'pino';
import type { Config } from './config.js';
import type { DatabasePool } from './db.js';
import { withTransaction } from './db.js';
import { pushToResponder, type PushSender } from './notifications/push.js';

interface OutboxRecord {
  id: string;
  aggregate_type: 'ALERT' | 'DISPATCH' | 'HELP_REQUEST';
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
}

export async function processOutboxBatch(
  pool: DatabasePool,
  config: Config,
  logger: Logger,
  useSkipLocked = true,
  /** Phase 8: Web Push sender for matched-request notices; null keeps them in-app only. */
  pushSender: PushSender | null = null,
) {
  return withTransaction(pool, async (client) => {
    const claimed = await client.query<OutboxRecord>(
      `SELECT id, aggregate_type, aggregate_id, event_type, payload, attempts
       FROM outbox_events
       WHERE status IN ('QUEUED', 'FAILED') AND available_at <= now() AND attempts < 5
       ORDER BY created_at LIMIT $1 FOR UPDATE${useSkipLocked ? ' SKIP LOCKED' : ''}`,
      [config.OUTBOX_BATCH_SIZE],
    );
    for (const event of claimed.rows) {
      try {
        await client.query(
          `UPDATE outbox_events SET status = 'SENDING', attempts = attempts + 1 WHERE id = $1`,
          [event.id],
        );
        logger.info(
          {
            outboxEventId: event.id,
            aggregateType: event.aggregate_type,
            aggregateId: event.aggregate_id,
          },
          'simulated notification accepted locally; no external provider contacted',
        );
        if (event.aggregate_type === 'ALERT') {
          await client.query(
            `UPDATE alert_delivery_records SET status = 'SERVER_RECEIVED', server_received_at = now(),
               updated_at = now() WHERE alert_id = $1 AND status = 'QUEUED'`,
            [event.aggregate_id],
          );
        } else if (event.aggregate_type === 'DISPATCH') {
          await client.query(
            `UPDATE dispatch_assignments SET status = 'NOTIFIED', updated_at = now()
             WHERE id = $1 AND status = 'CREATED'`,
            [event.aggregate_id],
          );
        } else if (
          event.event_type === 'HELP_REQUEST_NOTIFY_RESPONDER' &&
          pushSender &&
          typeof event.payload.responderId === 'string'
        ) {
          const sent = await pushToResponder(client, pushSender, {
            responderId: event.payload.responderId,
            helpRequestId: event.aggregate_id,
            mode: config.OPERATING_MODE,
          });
          logger.info(
            { outboxEventId: event.id, devices: sent.attempted, accepted: sent.accepted },
            'matched-request push handed to the push service (not a confirmation that anyone read it)',
          );
        }
        await client.query(
          `UPDATE outbox_events SET status = 'SERVER_RECEIVED', processed_at = now(), last_error = NULL
           WHERE id = $1`,
          [event.id],
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown processing error';
        await client.query(
          `UPDATE outbox_events SET status = 'FAILED', last_error = $2,
             available_at = now() + make_interval(secs => LEAST(300, power(2, attempts)::int))
           WHERE id = $1`,
          [event.id, message],
        );
      }
    }
    return claimed.rowCount ?? 0;
  });
}
