/**
 * Student feature configuration from build-time env.
 * VITE_API_BASE_URL unset → the clearly-labelled mock adapter is used.
 */
export interface StudentConfig {
  apiBaseUrl: string | null;
}

export function parseStudentConfig(env: { VITE_API_BASE_URL?: string }): StudentConfig {
  const apiBaseUrl = env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '') || null;
  return { apiBaseUrl };
}
