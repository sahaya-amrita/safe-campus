/**
 * App configuration from build-time env.
 *
 * VITE_API_BASE_URL is the API origin, e.g. http://127.0.0.1:3000. A trailing
 * "/api/v1" is accepted and removed, because every client adds the full path.
 * Unset → the app offers only the clearly-labelled offline mock mode.
 */
export interface AppConfig {
  apiBaseUrl: string | null;
}

export function parseAppConfig(env: { VITE_API_BASE_URL?: string }): AppConfig {
  const raw = env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '') ?? '';
  const withoutPath = raw.replace(/\/api\/v1$/, '');
  if (!withoutPath) return { apiBaseUrl: null };
  // A bare host (e.g. from a hosting dashboard) is treated as https.
  const apiBaseUrl = /^https?:\/\//.test(withoutPath) ? withoutPath : `https://${withoutPath}`;
  return { apiBaseUrl };
}

export const appConfig: AppConfig = parseAppConfig(
  import.meta.env as { VITE_API_BASE_URL?: string },
);
