/**
 * Background sync (Phase 8). When something is queued while offline the page
 * asks the browser for a `sync` event; the service worker (public/sw-extra.js)
 * then wakes an open app window to send it, or reminds the user to open the
 * app. The worker never sends anything itself and never reports delivery.
 */
export const SYNC_TAG = 'sahaya-outbox';
/** Window event fired when the service worker asks the app to send its queue. */
export const FLUSH_EVENT = 'sahaya:flush';

interface SyncCapableRegistration {
  sync?: { register(tag: string): Promise<void> };
}

/** Asks for a background sync. Resolves to whether the browser accepted it. */
export async function requestBackgroundSync(
  container: Pick<ServiceWorkerContainer, 'ready'> | undefined = typeof navigator !== 'undefined'
    ? navigator.serviceWorker
    : undefined,
): Promise<boolean> {
  try {
    if (!container) return false;
    const registration = (await container.ready) as SyncCapableRegistration;
    if (!registration.sync) return false;
    await registration.sync.register(SYNC_TAG);
    return true;
  } catch {
    return false;
  }
}

/** Relays the worker's "send now" message to the page as a FLUSH_EVENT. */
export function listenForServiceWorkerFlush(
  container:
    | Pick<ServiceWorkerContainer, 'addEventListener' | 'removeEventListener'>
    | undefined = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined,
  target: EventTarget = window,
): () => void {
  if (!container) return () => undefined;
  const onMessage = (event: MessageEvent<unknown>) => {
    const data = event.data as { type?: unknown } | null;
    if (data && data.type === 'sahaya-flush') target.dispatchEvent(new Event(FLUSH_EVENT));
  };
  container.addEventListener('message', onMessage as EventListener);
  return () => container.removeEventListener('message', onMessage as EventListener);
}

/**
 * Opens the in-app page a tapped notice points to (sent by the worker when an
 * app window is already open). Only same-app hash routes ("/#/...") are followed.
 */
export function listenForNoticeOpen(
  container:
    | Pick<ServiceWorkerContainer, 'addEventListener' | 'removeEventListener'>
    | undefined = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined,
  go: (hash: string) => void = (hash) => {
    window.location.hash = hash;
  },
): () => void {
  if (!container) return () => undefined;
  const onMessage = (event: MessageEvent<unknown>) => {
    const data = event.data as { type?: unknown; url?: unknown } | null;
    if (
      data?.type === 'sahaya-open' &&
      typeof data.url === 'string' &&
      /^\/#\/[\w/-]*$/.test(data.url)
    )
      go(data.url.slice(2));
  };
  container.addEventListener('message', onMessage as EventListener);
  return () => container.removeEventListener('message', onMessage as EventListener);
}
