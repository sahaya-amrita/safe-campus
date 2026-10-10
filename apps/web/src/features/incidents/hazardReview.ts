import type {
  HazardReport,
  HazardReviewDecision,
  HazardReviewRequest,
  HazardStatus,
} from './contracts';
import { HAZARD_STATUSES } from './contracts';

/** Which human review decisions are valid from each state. */
export const HAZARD_REVIEW_TRANSITIONS: Record<HazardStatus, readonly HazardReviewDecision[]> = {
  PENDING_REVIEW: ['VERIFIED', 'REJECTED', 'DUPLICATE'],
  VERIFIED: ['RESOLVED'],
  REJECTED: [],
  DUPLICATE: [],
  RESOLVED: [],
};

export function allowedDecisions(status: HazardStatus): readonly HazardReviewDecision[] {
  return HAZARD_REVIEW_TRANSITIONS[status];
}

export const HAZARD_STATUS_PRESENTATION: Record<
  HazardStatus,
  {
    label: string;
    icon: string;
    description: string;
    tone: 'pending' | 'verified' | 'neutral' | 'done';
  }
> = {
  PENDING_REVIEW: {
    label: 'Pending review',
    icon: '?',
    description: 'Unverified report. Not confirmed by any reviewer.',
    tone: 'pending',
  },
  VERIFIED: {
    label: 'Verified by reviewer',
    icon: '!',
    description:
      'A human reviewer confirmed this report. This is not an official campus alert; campus notices are issued separately by authorized staff.',
    tone: 'verified',
  },
  REJECTED: {
    label: 'Rejected',
    icon: '✕',
    description: 'Reviewer rejected this report.',
    tone: 'neutral',
  },
  DUPLICATE: {
    label: 'Duplicate',
    icon: '=',
    description: 'Reviewer linked this to another report.',
    tone: 'neutral',
  },
  RESOLVED: {
    label: 'Resolved',
    icon: '✓',
    description: 'Hazard recorded as resolved.',
    tone: 'done',
  },
};

export const DECISION_LABELS: Record<HazardReviewDecision, string> = {
  VERIFIED: 'Verify — I have confirmed this hazard',
  REJECTED: 'Reject — not a hazard / cannot be confirmed',
  DUPLICATE: 'Duplicate of another report',
  RESOLVED: 'Resolved — hazard no longer present',
};

export interface ReviewValidation {
  ok: boolean;
  message?: string;
}

export function validateReview(
  current: HazardStatus,
  review: Partial<HazardReviewRequest>,
): ReviewValidation {
  if (!review.decision) return { ok: false, message: 'Choose a review decision.' };
  if (!allowedDecisions(current).includes(review.decision)) {
    return { ok: false, message: `Cannot mark a ${current} report as ${review.decision}.` };
  }
  if (review.decision === 'DUPLICATE' && !review.duplicateOfId?.trim()) {
    return { ok: false, message: 'Enter the ID of the report this duplicates.' };
  }
  if (review.note !== undefined && review.note.length > 1000) {
    return { ok: false, message: 'Review note must be 1000 characters or fewer.' };
  }
  return { ok: true };
}

/**
 * Informational counts for the reports currently loaded. Intentionally returns
 * only numbers: there is no severity, alert level or threshold here, and no
 * caller may derive an official alert from these counts (safety rule 4).
 */
export function countByStatus(reports: readonly HazardReport[]): Record<HazardStatus, number> {
  const counts = Object.fromEntries(HAZARD_STATUSES.map((s) => [s, 0])) as Record<
    HazardStatus,
    number
  >;
  for (const r of reports) counts[r.status] += 1;
  return counts;
}

export function countPendingByCategory(
  reports: readonly HazardReport[],
): Array<{ category: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of reports) {
    if (r.status === 'PENDING_REVIEW') map.set(r.category, (map.get(r.category) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

function isHazardStatus(value: unknown): value is HazardStatus {
  return typeof value === 'string' && (HAZARD_STATUSES as readonly string[]).includes(value);
}

const optStr = (v: unknown) => v === undefined || v === null || typeof v === 'string';

export function parseHazardReport(value: unknown): HazardReport {
  if (typeof value !== 'object' || value === null)
    throw new TypeError('Hazard report must be an object');
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !v.id) throw new TypeError('Hazard report id missing');
  if (!isHazardStatus(v.status)) throw new TypeError(`Unknown hazard status: ${String(v.status)}`);
  if (typeof v.category !== 'string') throw new TypeError('Hazard category invalid');
  if (typeof v.description !== 'string') throw new TypeError('Hazard description invalid');
  if (typeof v.createdAt !== 'string' || Number.isNaN(Date.parse(v.createdAt))) {
    throw new TypeError('Hazard createdAt invalid');
  }
  for (const key of [
    'locationReference',
    'reviewedBy',
    'reviewedAt',
    'reviewNote',
    'duplicateOfId',
  ]) {
    if (!optStr(v[key])) throw new TypeError(`Hazard ${key} invalid`);
  }
  return {
    id: v.id,
    status: v.status,
    category: v.category,
    description: v.description,
    createdAt: v.createdAt,
    locationReference: (v.locationReference as string | null | undefined) ?? null,
    reviewedBy: (v.reviewedBy as string | null | undefined) ?? null,
    reviewedAt: (v.reviewedAt as string | null | undefined) ?? null,
    reviewNote: (v.reviewNote as string | null | undefined) ?? null,
    duplicateOfId: (v.duplicateOfId as string | null | undefined) ?? null,
  };
}
