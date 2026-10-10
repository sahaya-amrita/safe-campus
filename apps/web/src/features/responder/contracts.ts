/**
 * PROVISIONAL responder-side contract types.
 *
 * These mirror docs/api-contracts.md ("Initial Proposal"). `packages/contracts/`
 * (owned by Codex 1) does not exist yet. When it lands, replace these
 * declarations with re-exports from the shared package and delete the
 * duplicates. Fields marked ASSUMPTION are not in the written proposal and must
 * be confirmed by the API owner.
 */

/** DEMO/DRILL use synthetic or exercise data; LIVE is an approved deployment. */
export type AppMode = "DEMO" | "DRILL" | "LIVE";

export const ROLES = ["STUDENT", "VOLUNTEER", "RESPONDER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const HELP_REQUEST_STATUSES = [
  "OPEN",
  "ACKNOWLEDGED",
  "ASSIGNED",
  "RESOLVED",
  "CANCELLED",
] as const;
export type HelpRequestStatus = (typeof HELP_REQUEST_STATUSES)[number];

export interface HelpRequest {
  id: string;
  createdAt: string;
  lastUpdatedAt: string;
  status: HelpRequestStatus;
  /** Not enumerated in the proposal; displayed verbatim, never inferred. */
  priority: string | null;
  acknowledgedAt?: string | null;
  assignedResponderId?: string | null;
  /** ASSUMPTION: server-attributed id of the responder who acknowledged. */
  acknowledgedBy?: string | null;
  /** ASSUMPTION: coarse, responder-only location reference (never precise GPS). */
  locationReference?: string | null;
}

/** ASSUMPTION: cursor page shape for list endpoints. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; requestId?: string };
}

/**
 * ASSUMPTION: no roll-call endpoint exists in the proposal. This shape is what
 * the UI needs; the HTTP adapter reports it as unavailable until one is agreed.
 */
export interface RollCallSnapshot {
  /** Human-readable description of exactly which population is covered. */
  scopeLabel: string;
  /** PARTIAL = known subset; UNKNOWN = the data source cannot say. */
  scopeKind: "PARTIAL" | "UNKNOWN";
  /** null when the expected headcount for the scope is not known. */
  expectedCount: number | null;
  safeCount: number;
  needHelpCount: number;
  asOf: string;
  isDemo: boolean;
}
