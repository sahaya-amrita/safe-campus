/**
 * PROVISIONAL hazard-report contract types mirroring docs/api-contracts.md.
 * Replace with re-exports from packages/contracts once Codex 1 publishes it.
 */
import type { Page } from '../responder/contracts';

export const HAZARD_STATUSES = [
  'PENDING_REVIEW',
  'VERIFIED',
  'REJECTED',
  'DUPLICATE',
  'RESOLVED',
] as const;
export type HazardStatus = (typeof HAZARD_STATUSES)[number];

export interface HazardReport {
  id: string;
  /** Free text in the proposal; displayed verbatim. */
  category: string;
  description: string;
  createdAt: string;
  status: HazardStatus;
  locationReference?: string | null;
  /** Set only by the server from the authenticated reviewer. */
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  /** ASSUMPTION: reviewer note and duplicate link returned by the server. */
  reviewNote?: string | null;
  duplicateOfId?: string | null;
}

/** Decisions a human reviewer can record. PENDING_REVIEW is never a decision. */
export type HazardReviewDecision = Exclude<HazardStatus, 'PENDING_REVIEW'>;

/**
 * ASSUMPTION: body of POST /api/v1/responder/hazard-reports/:id/review.
 * Reviewer identity is deliberately absent: the server derives it from the
 * authenticated session, so the client cannot attribute a review to anyone.
 */
export interface HazardReviewRequest {
  decision: HazardReviewDecision;
  note?: string;
  duplicateOfId?: string;
}

export interface HazardReviewApi {
  listHazardReports(query: {
    status?: HazardStatus;
    cursor?: string | null;
    limit?: number;
  }): Promise<Page<HazardReport>>;
  reviewHazardReport(
    id: string,
    review: HazardReviewRequest,
    idempotencyKey: string,
  ): Promise<HazardReport>;
}
