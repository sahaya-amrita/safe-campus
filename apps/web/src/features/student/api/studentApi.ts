import type { RequestProblem, SendOutcome } from '../../../lib/offline';
import type { CheckIn, CreateCheckInRequest, InstructionPackWithContent } from '../contracts/provisional';

export type PackListResult =
  | { kind: 'ok'; packs: InstructionPackWithContent[] }
  | { kind: 'error'; problem: RequestProblem };

/**
 * Boundary between the student feature and the backend. Implemented by the
 * HTTP adapter (real API) and the clearly-labelled mock adapter.
 */
export interface StudentApi {
  createCheckIn(request: CreateCheckInRequest, idempotencyKey: string): Promise<SendOutcome<CheckIn>>;
  listInstructionPacks(language: string): Promise<PackListResult>;
}
