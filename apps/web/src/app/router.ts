import { useCallback, useSyncExternalStore } from 'react';

/**
 * Minimal hash router: works from the PWA's offline app shell and static
 * hosting without server rewrites. Routes look like "#/student/alerts" or
 * "#/responder/incidents/<id>"; the route tree is described in routes.ts.
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

/** Replaces the current history entry, so Back never returns to a redirect. */
export function redirect(path: string): void {
  if (currentPath() === path) return;
  const url = new URL(window.location.href);
  url.hash = path;
  window.location.replace(url.href);
}

export function useRoute(): { path: string; segments: string[]; navigate: (path: string) => void } {
  const path = useSyncExternalStore(subscribe, currentPath, () => '/');
  const go = useCallback((next: string) => navigate(next), []);
  return { path, segments: path.split('/').filter(Boolean), navigate: go };
}
