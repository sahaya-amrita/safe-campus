/**
 * Authenticated JSON client for the Amrita Sahaya API. Every request carries
 * the session's Bearer token; authorization is always decided by the server.
 */
export type ApiProblem =
  | 'OFFLINE'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID'
  | 'CONFLICT'
  | 'SERVER';

export class ApiError extends Error {
  constructor(
    readonly problem: ApiProblem,
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    /** The server's `error.details`, e.g. `{ retryAfterSeconds }`. */
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function problemOf(error: unknown): ApiProblem {
  return error instanceof ApiError ? error.problem : 'NETWORK';
}

/** Plain-language explanation that never implies an action succeeded. */
export function describeProblem(error: unknown): string {
  const problem = problemOf(error);
  const detail =
    error instanceof ApiError && error.problem === 'INVALID' ? ` ${error.message}` : '';
  switch (problem) {
    case 'OFFLINE':
      return 'You are offline. Nothing was sent.';
    case 'TIMEOUT':
      return 'The server did not answer in time. It may or may not have been recorded; check again before retrying.';
    case 'UNAUTHENTICATED':
      return 'Your session has ended. Sign in again.';
    case 'FORBIDDEN':
      return 'Your role is not permitted to do this. The server refused it.';
    case 'NOT_FOUND':
      return 'Not found on the server.';
    case 'CONFLICT':
      return 'This conflicts with a previous request.';
    case 'INVALID':
      return `The server rejected this request.${detail}`;
    case 'SERVER':
      return 'The server is unavailable. Nothing was confirmed.';
    default:
      return 'Could not reach the server. Nothing was confirmed.';
  }
}

export function newIdempotencyKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  /** Called on any 401 so the shell can end the session. */
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
  isOnline?: () => boolean;
  timeoutMs?: number;
}

export class ApiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly isOnline: () => boolean;
  private readonly timeoutMs: number;

  constructor(private readonly options: ApiClientOptions) {
    this.fetchImpl = options.fetchImpl ?? ((...args) => globalThis.fetch(...args));
    this.isOnline = options.isOnline ?? (() => globalThis.navigator?.onLine ?? true);
    this.timeoutMs = options.timeoutMs ?? 12_000;
  }

  get baseUrl(): string {
    return this.options.baseUrl;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  /** Mutations always send an Idempotency-Key; reuse the same key when retrying. */
  post<T>(path: string, body: unknown, idempotencyKey: string = newIdempotencyKey()): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  }

  delete<T>(path: string, idempotencyKey: string = newIdempotencyKey()): Promise<T> {
    return this.request<T>(path, {
      method: 'DELETE',
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    if (!this.isOnline()) throw new ApiError('OFFLINE', 0, 'OFFLINE', 'Offline');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const token = this.options.getToken();
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(init.headers as Record<string, string> | undefined),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });
    } catch {
      throw controller.signal.aborted
        ? new ApiError('TIMEOUT', 0, 'TIMEOUT', 'Request timed out')
        : new ApiError('NETWORK', 0, 'NETWORK_ERROR', 'Network request failed');
    } finally {
      clearTimeout(timer);
    }
    let body: unknown = null;
    if (response.status !== 204) {
      try {
        body = await response.json();
      } catch {
        body = null;
      }
    }
    if (response.ok) return body as T;
    const error = (
      body as {
        error?: { code?: string; message?: string; requestId?: string; details?: unknown };
      } | null
    )?.error;
    const code = error?.code ?? `HTTP_${response.status}`;
    const message = error?.message ?? 'Request failed';
    if (response.status === 401) {
      this.options.onUnauthorized?.();
      throw new ApiError('UNAUTHENTICATED', 401, code, message, error?.requestId);
    }
    const problem: ApiProblem =
      response.status === 403
        ? 'FORBIDDEN'
        : response.status === 404
          ? 'NOT_FOUND'
          : response.status === 409
            ? 'CONFLICT'
            : response.status === 408 || response.status === 504
              ? 'TIMEOUT'
              : response.status >= 500 || response.status === 429
                ? 'SERVER'
                : 'INVALID';
    throw new ApiError(problem, response.status, code, message, error?.requestId, error?.details);
  }
}
