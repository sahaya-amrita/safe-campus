import { z } from 'zod';

/*
 * Phase 8: Web Push notices for responders. Off unless the server has VAPID
 * keys. A push only says a help request was matched; it carries no personal
 * details and never replaces the in-app inbox, which stays the record.
 */

const base64url = z.string().regex(/^[A-Za-z0-9_-]+=*$/, 'Expected base64url');

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: base64url.min(40).max(200),
    auth: base64url.min(10).max(100),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushUnsubscribeSchema = z.object({ endpoint: z.string().url().max(1000) });

export interface PushConfigView {
  enabled: boolean;
  /** VAPID public key for PushManager.subscribe; null when push is off. */
  publicKey: string | null;
  /** Active devices registered by the signed-in user. */
  devices: number;
  note: string;
}
