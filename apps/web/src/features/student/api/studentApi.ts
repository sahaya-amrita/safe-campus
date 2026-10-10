import type { RequestProblem, SendOutcome } from '../../../lib/offline';
import type { CheckInDraft, CheckInReceipt, CheckInSession, StudentInstructionPack } from '../contracts/studentContract';

export type PackListResult =
  | { kind: 'ok'; packs: StudentInstructionPack[] }
  | { kind: 'error'; problem: RequestProblem };

export type SessionResult =
  | { kind: 'found'; session: CheckInSession }
  | { kind: 'none' }
  | { kind: 'error'; problem: RequestProblem };

/** Detail codes the UI explains for terminal failures produced on the client. */
export const CLIENT_FAILURE = {
  noSession: 'NO_SESSION',
  invalid: 'INVALID_REQUEST',
} as const;

/**
 * Boundary between the student feature and the backend. Implemented by the
 * HTTP adapter (real API) and the clearly-labelled mock adapter.
 */
export interface StudentApi {
  /** `clientActionId` is the device-generated idempotency key, reused on every retry. */
  submitCheckIn(draft: CheckInDraft, clientActionId: string, clientCreatedAt: string): Promise<SendOutcome<CheckInReceipt>>;
  /** The incident or drill a check-in will be attached to, if one is active. */
  getActiveSession(): Promise<SessionResult>;
  listInstructionPacks(language: string): Promise<PackListResult>;
}
