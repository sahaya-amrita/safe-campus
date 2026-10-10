/**
 * Isolated MOCK adapter that simulates the server side of the responder API
 * with SYNTHETIC demo records. It never contacts anyone or anything. It
 * enforces the same role checks and transition rules the real API must, so
 * the UI's error paths can be exercised. Identities and locations below are
 * fictional placeholders, not campus data.
 */
import type { HazardReport, HazardReviewRequest, HazardStatus } from "../incidents/contracts";
import { validateReview } from "../incidents/hazardReview";
import type { ResponderApi } from "./api";
import { DEFAULT_PAGE_SIZE } from "./api";
import { ApiRequestError } from "./apiError";
import type { HelpRequest, HelpRequestStatus, Page, Role, RollCallSnapshot } from "./contracts";
import { canAcknowledge } from "./helpRequests";

export interface MockSession {
  /** Role the simulated server believes the caller has. */
  role: Role | null;
  /** Synthetic actor id used for server-side attribution. */
  actorId: string;
}

export interface MockResponderApiOptions {
  session?: MockSession;
  now?: () => Date;
  latencyMs?: number;
  helpRequests?: HelpRequest[];
  hazardReports?: HazardReport[];
  rollCall?: RollCallSnapshot | null;
}

const RESPONDER_ROLES: ReadonlySet<Role> = new Set(["RESPONDER", "ADMIN"]);

function minutesAgo(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

export function demoHelpRequests(now: Date): HelpRequest[] {
  return [
    { id: "DEMO-HR-001", status: "OPEN", priority: null, createdAt: minutesAgo(now, 7), lastUpdatedAt: minutesAgo(now, 7), locationReference: "Demo zone A (synthetic)" },
    { id: "DEMO-HR-002", status: "OPEN", priority: null, createdAt: minutesAgo(now, 3), lastUpdatedAt: minutesAgo(now, 3), locationReference: null },
    { id: "DEMO-HR-003", status: "ACKNOWLEDGED", priority: null, createdAt: minutesAgo(now, 25), lastUpdatedAt: minutesAgo(now, 20), acknowledgedAt: minutesAgo(now, 20), acknowledgedBy: "demo-responder-2", locationReference: "Demo zone B (synthetic)" },
    { id: "DEMO-HR-004", status: "ASSIGNED", priority: null, createdAt: minutesAgo(now, 40), lastUpdatedAt: minutesAgo(now, 30), acknowledgedAt: minutesAgo(now, 35), acknowledgedBy: "demo-responder-2", assignedResponderId: "demo-responder-2" },
    { id: "DEMO-HR-005", status: "RESOLVED", priority: null, createdAt: minutesAgo(now, 90), lastUpdatedAt: minutesAgo(now, 60), acknowledgedAt: minutesAgo(now, 85), acknowledgedBy: "demo-responder-1" },
    { id: "DEMO-HR-006", status: "CANCELLED", priority: null, createdAt: minutesAgo(now, 120), lastUpdatedAt: minutesAgo(now, 115) },
  ];
}

export function demoHazardReports(now: Date): HazardReport[] {
  return [
    { id: "DEMO-HZ-001", status: "PENDING_REVIEW", category: "Blocked pathway (demo)", description: "Synthetic report: obstruction reported on a demo path.", createdAt: minutesAgo(now, 12), locationReference: "Demo zone A (synthetic)" },
    { id: "DEMO-HZ-002", status: "PENDING_REVIEW", category: "Blocked pathway (demo)", description: "Synthetic report: similar obstruction, possibly the same one.", createdAt: minutesAgo(now, 10), locationReference: "Demo zone A (synthetic)" },
    { id: "DEMO-HZ-003", status: "PENDING_REVIEW", category: "Blocked pathway (demo)", description: "Synthetic report: third report of an obstruction.", createdAt: minutesAgo(now, 9), locationReference: null },
    { id: "DEMO-HZ-004", status: "PENDING_REVIEW", category: "Water leak (demo)", description: "Synthetic report: water on the floor.", createdAt: minutesAgo(now, 5), locationReference: "Demo zone C (synthetic)" },
    { id: "DEMO-HZ-005", status: "VERIFIED", category: "Water leak (demo)", description: "Synthetic report: verified leak.", createdAt: minutesAgo(now, 60), reviewedBy: "demo-responder-2", reviewedAt: minutesAgo(now, 50) },
    { id: "DEMO-HZ-006", status: "REJECTED", category: "Other (demo)", description: "Synthetic report: could not be confirmed.", createdAt: minutesAgo(now, 80), reviewedBy: "demo-responder-1", reviewedAt: minutesAgo(now, 70) },
  ];
}

export function demoRollCall(now: Date): RollCallSnapshot {
  return {
    scopeLabel: "Demo group (synthetic, 40 fictional participants)",
    scopeKind: "PARTIAL",
    expectedCount: 40,
    safeCount: 31,
    needHelpCount: 2,
    asOf: minutesAgo(now, 1),
    isDemo: true,
  };
}

export class MockResponderApi implements ResponderApi {
  readonly kind = "MOCK" as const;
  private session: MockSession;
  private readonly now: () => Date;
  private readonly latencyMs: number;
  private helpRequests: HelpRequest[];
  private hazardReports: HazardReport[];
  private readonly rollCall: RollCallSnapshot | null;
  private readonly idempotency = new Map<string, unknown>();
  private pendingFailures: ApiRequestError[] = [];
  /** Simulated server-side audit trail (synthetic actor ids only). */
  readonly auditLog: Array<{ at: string; actorId: string; action: string; targetId: string }> = [];

  constructor(options: MockResponderApiOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.session = options.session ?? { role: "RESPONDER", actorId: "demo-responder-1" };
    this.latencyMs = options.latencyMs ?? 0;
    const now = this.now();
    this.helpRequests = structuredClone(options.helpRequests ?? demoHelpRequests(now));
    this.hazardReports = structuredClone(options.hazardReports ?? demoHazardReports(now));
    this.rollCall = options.rollCall === undefined ? demoRollCall(now) : options.rollCall;
  }

  /** Test hook: make the next call fail as the server would. */
  failNext(error: ApiRequestError): void {
    this.pendingFailures.push(error);
  }

  setSession(session: MockSession): void {
    this.session = session;
  }

  private async serve<T>(fn: () => T): Promise<T> {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
    const failure = this.pendingFailures.shift();
    if (failure) throw failure;
    if (this.session.role === null) throw new ApiRequestError(401, "UNAUTHENTICATED", "Sign in required");
    if (!RESPONDER_ROLES.has(this.session.role)) {
      throw new ApiRequestError(403, "FORBIDDEN", "Responder role required");
    }
    return structuredClone(fn());
  }

  private page<T extends { id: string }>(items: T[], cursor: string | null | undefined, limit: number): Page<T> {
    const start = cursor ? items.findIndex((i) => i.id === cursor) + 1 : 0;
    const slice = items.slice(start, start + limit);
    const last = slice[slice.length - 1];
    return { items: slice, nextCursor: start + limit < items.length && last ? last.id : null };
  }

  listHelpRequests(query: { status?: HelpRequestStatus; cursor?: string | null; limit?: number }) {
    return this.serve(() => {
      const filtered = this.helpRequests
        .filter((r) => !query.status || r.status === query.status)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      return this.page(filtered, query.cursor, query.limit ?? DEFAULT_PAGE_SIZE);
    });
  }

  acknowledgeHelpRequest(id: string, idempotencyKey: string) {
    return this.serve(() => {
      const cacheKey = `ack:${idempotencyKey}`;
      if (this.idempotency.has(cacheKey)) return this.idempotency.get(cacheKey) as HelpRequest;
      const idx = this.helpRequests.findIndex((r) => r.id === id);
      const current = this.helpRequests[idx];
      if (!current) throw new ApiRequestError(404, "NOT_FOUND", "Help request not found");
      if (!canAcknowledge(current)) {
        throw new ApiRequestError(409, "INVALID_TRANSITION", `Cannot acknowledge a ${current.status} request`);
      }
      const at = this.now().toISOString();
      const updated: HelpRequest = {
        ...current,
        status: "ACKNOWLEDGED",
        acknowledgedAt: at,
        acknowledgedBy: this.session.actorId,
        lastUpdatedAt: at,
      };
      this.helpRequests[idx] = updated;
      this.idempotency.set(cacheKey, updated);
      this.auditLog.push({ at, actorId: this.session.actorId, action: "HELP_REQUEST_ACKNOWLEDGED", targetId: id });
      return updated;
    });
  }

  listHazardReports(query: { status?: HazardStatus; cursor?: string | null; limit?: number }) {
    return this.serve(() => {
      const filtered = this.hazardReports
        .filter((r) => !query.status || r.status === query.status)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      return this.page(filtered, query.cursor, query.limit ?? DEFAULT_PAGE_SIZE);
    });
  }

  reviewHazardReport(id: string, review: HazardReviewRequest, idempotencyKey: string) {
    return this.serve(() => {
      const cacheKey = `review:${idempotencyKey}`;
      if (this.idempotency.has(cacheKey)) return this.idempotency.get(cacheKey) as HazardReport;
      const idx = this.hazardReports.findIndex((r) => r.id === id);
      const current = this.hazardReports[idx];
      if (!current) throw new ApiRequestError(404, "NOT_FOUND", "Hazard report not found");
      const check = validateReview(current.status, review);
      if (!check.ok) throw new ApiRequestError(409, "INVALID_TRANSITION", check.message ?? "Invalid review");
      if (review.decision === "DUPLICATE" && !this.hazardReports.some((r) => r.id === review.duplicateOfId?.trim())) {
        throw new ApiRequestError(422, "DUPLICATE_TARGET_NOT_FOUND", "Referenced report does not exist");
      }
      const at = this.now().toISOString();
      const updated: HazardReport = {
        ...current,
        status: review.decision,
        reviewedBy: this.session.actorId,
        reviewedAt: at,
        reviewNote: review.note?.trim() || null,
        duplicateOfId: review.decision === "DUPLICATE" ? review.duplicateOfId!.trim() : null,
      };
      this.hazardReports[idx] = updated;
      this.idempotency.set(cacheKey, updated);
      this.auditLog.push({ at, actorId: this.session.actorId, action: `HAZARD_REVIEWED_${review.decision}`, targetId: id });
      return updated;
    });
  }

  getRollCallSummary() {
    return this.serve(() => {
      if (!this.rollCall) throw new ApiRequestError(501, "NOT_AVAILABLE", "No roll-call data");
      return this.rollCall;
    });
  }
}
