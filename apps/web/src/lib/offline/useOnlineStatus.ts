import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

/**
 * Browser network status. `true` only means a network interface is up; it
 * does not prove the server is reachable, so never use it alone to describe delivery.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, isBrowserOnline, () => true);
}
