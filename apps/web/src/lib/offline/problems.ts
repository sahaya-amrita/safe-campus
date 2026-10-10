/**
 * Why a request did not reach a confirmed outcome. Shared by the offline
 * queue and by read-only fetches (e.g. instruction packs).
 *
 * Retryable: the outcome is unknown or the network is down; sending again
 * with the same idempotency key is safe.
 */
export type RetryableProblem = 'OFFLINE' | 'TIMEOUT' | 'SERVER_UNAVAILABLE';

/** Terminal: the server answered and refused. Resending unchanged will not help. */
export type TerminalProblem = 'PERMISSION_DENIED' | 'REJECTED';

export type RequestProblem = RetryableProblem | TerminalProblem;

export function isRetryable(problem: RequestProblem): problem is RetryableProblem {
  return problem === 'OFFLINE' || problem === 'TIMEOUT' || problem === 'SERVER_UNAVAILABLE';
}
