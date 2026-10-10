import type { HazardVerificationStatus } from '@sahaya/contracts';

/**
 * Display level for the responder hazard queue (blueprint §13.1), derived from
 * stored facts only. It never changes a record's verification status.
 * - L1 Unverified report needing review.
 * - L2 Several independent people reported it (or a verifier marked it
 *   corroborated): "suspected, verification in progress". A surge means "look
 *   now", not "it is true".
 * - L3 Verified by an authorised person. Only a person can reach L3.
 * L4 (official campus alert) is the separate, two-step alert workflow.
 */
export type HazardLevel = 1 | 2 | 3;

/** Distinct reporters needed for L2. A placeholder until the ERT calibrates it. */
export const L2_INDEPENDENT_REPORTERS = 2;

export function hazardLevel(
  status: HazardVerificationStatus,
  independentReporters: number,
): HazardLevel | null {
  if (status === 'RESOLVED' || status === 'DISMISSED') return null;
  if (status === 'VERIFIED') return 3;
  if (status === 'CORROBORATED' || independentReporters >= L2_INDEPENDENT_REPORTERS) return 2;
  return 1;
}
