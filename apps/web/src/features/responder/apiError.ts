import type { ApiErrorBody } from './contracts';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const err = (value as { error?: unknown }).error;
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { code?: unknown }).code === 'string' &&
    typeof (err as { message?: unknown }).message === 'string'
  );
}

export type ErrorKind =
  'UNAUTHENTICATED' | 'FORBIDDEN' | 'CONFLICT' | 'UNAVAILABLE' | 'NETWORK' | 'OTHER';

export function classifyError(error: unknown): ErrorKind {
  if (!(error instanceof ApiRequestError)) return 'OTHER';
  if (error.status === 401) return 'UNAUTHENTICATED';
  if (error.status === 403) return 'FORBIDDEN';
  if (error.status === 409) return 'CONFLICT';
  if (error.status === 501 || error.code === 'NOT_AVAILABLE') return 'UNAVAILABLE';
  if (error.status === 0) return 'NETWORK';
  return 'OTHER';
}

/** Safe, user-facing message. Never surfaces stack traces or raw bodies. */
export function describeError(error: unknown): string {
  switch (classifyError(error)) {
    case 'UNAUTHENTICATED':
      return 'You are not signed in as an authorized responder.';
    case 'FORBIDDEN':
      return 'Your account is not authorized for responder actions.';
    case 'CONFLICT':
      return 'The record changed on the server. Reload to see its current state.';
    case 'UNAVAILABLE':
      return 'This data is not available from the server yet.';
    case 'NETWORK':
      return 'Could not reach the server. Nothing was changed.';
    default:
      return error instanceof ApiRequestError
        ? `The server rejected the request (${error.code}).`
        : 'Something went wrong. Nothing was confirmed by the server.';
  }
}
