import { useCallback, useSyncExternalStore } from 'react';

/**
 * Minimal hash router: works from the PWA's offline app shell and static
 * hosting without server rewrites. Routes look like "#/alerts" or
 * "#/r/incidents/<id>".
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function currentPath(): string {
  const hash = window.location.hash.replace(/^#/, '');
  return hash.startsWith('/') ? hash : '/';
}

export function navigate(path: string): void {
  if (currentPath() !== path) window.location.hash = path;
}

export function useRoute(): { path: string; segments: string[]; navigate: (path: string) => void } {
  const path = useSyncExternalStore(subscribe, currentPath, () => '/');
  const go = useCallback((next: string) => navigate(next), []);
  return { path, segments: path.split('/').filter(Boolean), navigate: go };
}
