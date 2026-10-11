/**
 * Browser side of Web Push (Phase 8). Registers this device with the
 * browser's push service using the server's VAPID public key. Nothing here
 * runs unless a responder presses "Turn on" and allows notifications.
 */

export interface DevicePushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushEnvironment {
  supported: boolean;
  permission: () => NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
  /** The current subscription for this device, if any. */
  current: () => Promise<DevicePushSubscription | null>;
  subscribe: (publicKey: string) => Promise<DevicePushSubscription>;
  /** Unsubscribes this device; resolves to the endpoint that was removed. */
  unsubscribe: () => Promise<string | null>;
}

/** VAPID keys are base64url; PushManager wants raw bytes. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const toJson = (sub: PushSubscription): DevicePushSubscription => {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  return {
    endpoint: json.endpoint ?? sub.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
  };
};

/** The real browser environment. */
export function browserPushEnvironment(): PushEnvironment {
  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
  const manager = async () => (await navigator.serviceWorker.ready).pushManager;
  return {
    supported,
    permission: () => (supported ? Notification.permission : 'denied'),
    requestPermission: () => Notification.requestPermission(),
    current: async () => {
      const sub = await (await manager()).getSubscription();
      return sub ? toJson(sub) : null;
    },
    subscribe: async (publicKey) =>
      toJson(
        await (
          await manager()
        ).subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }),
      ),
    unsubscribe: async () => {
      const sub = await (await manager()).getSubscription();
      if (!sub) return null;
      await sub.unsubscribe();
      return sub.endpoint;
    },
  };
}
