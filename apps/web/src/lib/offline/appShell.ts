import { useEffect, useState } from 'react';

/**
 * True only when a service worker controls this page, i.e. the app shell can
 * be reopened without a network. Never inferred from build mode or install state.
 */
export function useOfflineReady(): boolean {
  const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const [ready, setReady] = useState(() => supported && navigator.serviceWorker.controller !== null);
  useEffect(() => {
    if (!supported) return;
    const update = () => setReady(navigator.serviceWorker.controller !== null);
    navigator.serviceWorker.addEventListener('controllerchange', update);
    void navigator.serviceWorker.ready.then(update).catch(() => undefined);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', update);
  }, [supported]);
  return ready;
}

/** Event fired by the app shell when a new version is installed and waiting. */
export const UPDATE_READY_EVENT = 'sahaya:update-ready';

/** Returns a function that activates the waiting version, or null when none is waiting. */
export function useUpdateReady(): (() => void) | null {
  const [apply, setApply] = useState<(() => void) | null>(null);
  useEffect(() => {
    const onReady = (event: Event) => {
      const detail = (event as CustomEvent<() => void>).detail;
      if (typeof detail === 'function') setApply(() => detail);
    };
    window.addEventListener(UPDATE_READY_EVENT, onReady);
    return () => window.removeEventListener(UPDATE_READY_EVENT, onReady);
  }, []);
  return apply;
}
