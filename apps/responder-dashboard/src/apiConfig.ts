// TEMPORARY harness config. VITE_* values are bundled into the page and are
// PUBLIC: only the API's base URL belongs here, never a key or secret.
const fromEnv = import.meta.env.VITE_API_BASE_URL?.trim();

/** Production builds must set VITE_API_BASE_URL; dev defaults to the local API. */
export const API_BASE_URL = (fromEnv && fromEnv.length > 0 ? fromEnv : import.meta.env.DEV ? "http://localhost:3000" : "").replace(/\/$/, "");
