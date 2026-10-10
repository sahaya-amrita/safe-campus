// TEMPORARY harness config. VITE_* values are bundled into the page and are
// PUBLIC: only the API's base URL belongs here, never a key or secret.
const raw = import.meta.env.VITE_API_BASE_URL?.trim() ?? '';

/** Accepts a full URL or a bare host (as Render's Blueprint provides it → https://host). */
export function normaliseApiBaseUrl(value: string, isDev: boolean): string {
  const v = value.replace(/\/$/, '');
  if (!v) return isDev ? 'http://localhost:3000' : '';
  return /^https?:\/\//.test(v) ? v : `https://${v}`;
}

/** Production builds must set VITE_API_BASE_URL; dev defaults to the local API. */
export const API_BASE_URL = normaliseApiBaseUrl(raw, import.meta.env.DEV);
