import type pg from 'pg';
import webpush from 'web-push';
import type { Config } from '../config.js';
import { pushSettings } from '../config.js';

/**
 * Web Push for responders (Phase 8). Off unless VAPID keys are configured.
 *
 * - The server only contacts the browser vendors' push services (allow-list
 *   below), never an address a client makes up.
 * - A push says only that a help request was matched and links to the inbox.
 *   No names, locations or messages leave the server in a push.
 * - "Accepted by the push service" is all a success means. It is not "read",
 *   and never "responder on the way".
 */

export interface PushPayload {
  title: string;
  body: string;
  /** In-app path to open, starting with "/". */
  url: string;
  tag: string;
}

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushResult = { ok: true } | { ok: false; gone: boolean; error: string };
export type PushSender = (
  subscription: StoredSubscription,
  payload: PushPayload,
) => Promise<PushResult>;

const PUSH_HOSTS: readonly RegExp[] = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^(?:[a-z0-9-]+\.)*push\.apple\.com$/,
  /^(?:[a-z0-9-]+\.)*notify\.windows\.com$/,
];

/** Only HTTPS endpoints on the known browser push services are accepted. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || (url.port !== '' && url.port !== '443')) return false;
  if (url.username || url.password) return false;
  return PUSH_HOSTS.some((host) => host.test(url.hostname.toLowerCase()));
}

/** The real sender, or null when push is not configured. */
export function createPushSender(config: Config): PushSender | null {
  if (!pushSettings(config).enabled) return null;
  const vapidDetails = {
    subject: config.VAPID_SUBJECT!,
    publicKey: config.VAPID_PUBLIC_KEY!,
    privateKey: config.VAPID_PRIVATE_KEY!,
  };
  return async (subscription, payload) => {
    if (!isAllowedPushEndpoint(subscription.endpoint))
      return { ok: false, gone: true, error: 'Endpoint not on the push-service allow-list' };
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(payload),
        { TTL: 600, urgency: 'high', timeout: 10_000, vapidDetails },
      );
      return { ok: true };
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      return {
        ok: false,
        gone: status === 404 || status === 410,
        error: status ? `Push service answered ${status}` : 'Push service unreachable',
      };
    }
  };
}

export function matchedRequestPayload(
  helpRequestId: string,
  mode: Config['OPERATING_MODE'],
): PushPayload {
  return {
    title: mode === 'DEMO' ? 'DEMO: help request matched to you' : 'Help request matched to you',
    body: 'Open Amrita Sahaya to review and acknowledge it.',
    url: '/#/responder/help',
    tag: `help-${helpRequestId}`,
  };
}

/**
 * Sends the matched-request notice to every active device of one responder
 * and records how many the push service accepted. Failures are recorded, never
 * thrown: the in-app inbox already holds the notice.
 */
export async function pushToResponder(
  client: pg.PoolClient,
  sender: PushSender,
  input: { responderId: string; helpRequestId: string; mode: Config['OPERATING_MODE'] },
): Promise<{ attempted: number; accepted: number }> {
  const owner = await client.query<{ user_id: string }>(
    'SELECT user_id FROM responders WHERE id = $1',
    [input.responderId],
  );
  const userId = owner.rows[0]?.user_id;
  if (!userId) return { attempted: 0, accepted: 0 };
  const subscriptions = await client.query<{
    id: string;
    endpoint: string;
    p256dh: string;
    auth_secret: string;
    failure_count: number;
  }>(
    `SELECT id, endpoint, p256dh, auth_secret, failure_count FROM push_subscriptions
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
  const payload = matchedRequestPayload(input.helpRequestId, input.mode);
  let accepted = 0;
  for (const sub of subscriptions.rows) {
    const result = await sender(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth_secret },
      payload,
    );
    if (result.ok) {
      accepted += 1;
      await client.query(
        'UPDATE push_subscriptions SET last_success_at = now(), failure_count = 0 WHERE id = $1',
        [sub.id],
      );
    } else {
      // Gone endpoints (404/410) are revoked at once; others after ten failures.
      const failures = Number(sub.failure_count) + 1;
      await client.query(
        `UPDATE push_subscriptions SET failure_count = $2,
           revoked_at = ${result.gone || failures >= 10 ? 'now()' : 'revoked_at'}
         WHERE id = $1`,
        [sub.id, failures],
      );
    }
  }
  await client.query(
    `UPDATE help_request_notifications SET push_devices = $3, push_attempted_at = now()
     WHERE help_request_id = $1 AND responder_id = $2`,
    [input.helpRequestId, input.responderId, accepted],
  );
  return { attempted: subscriptions.rows.length, accepted };
}
