import type { HelpRequest, HelpRequestStatus } from "./contracts";
import { HELP_REQUEST_STATUSES } from "./contracts";

/**
 * Responder-side lifecycle. Terminal states have no outgoing transitions.
 * The UI only offers transitions that also have an agreed API operation
 * (see AVAILABLE_ACTIONS); the rest are documented here for the integrator.
 */
export const HELP_REQUEST_TRANSITIONS: Record<HelpRequestStatus, readonly HelpRequestStatus[]> = {
  OPEN: ["ACKNOWLEDGED", "CANCELLED"],
  ACKNOWLEDGED: ["ASSIGNED", "RESOLVED", "CANCELLED"],
  ASSIGNED: ["RESOLVED", "CANCELLED"],
  RESOLVED: [],
  CANCELLED: [],
};

export function canTransition(from: HelpRequestStatus, to: HelpRequestStatus): boolean {
  return HELP_REQUEST_TRANSITIONS[from].includes(to);
}

export function isTerminal(status: HelpRequestStatus): boolean {
  return HELP_REQUEST_TRANSITIONS[status].length === 0;
}

/** Only acknowledgement has a proposed endpoint today. */
export function canAcknowledge(request: Pick<HelpRequest, "status">): boolean {
  return request.status === "OPEN";
}

export interface StatusPresentation {
  label: string;
  /** Non-colour cue so states are distinguishable without colour. */
  icon: string;
  description: string;
  tone: "urgent" | "progress" | "assigned" | "done" | "neutral";
}

export const HELP_REQUEST_STATUS_PRESENTATION: Record<HelpRequestStatus, StatusPresentation> = {
  OPEN: {
    label: "Open",
    icon: "●",
    description: "Not yet acknowledged by any responder.",
    tone: "urgent",
  },
  ACKNOWLEDGED: {
    label: "Acknowledged",
    icon: "◐",
    description: "A responder has recorded that they saw this request. Not yet assigned.",
    tone: "progress",
  },
  ASSIGNED: {
    label: "Assigned",
    icon: "◆",
    description: "Assigned to a responder in the system.",
    tone: "assigned",
  },
  RESOLVED: {
    label: "Resolved",
    icon: "✓",
    description: "Closed as resolved.",
    tone: "done",
  },
  CANCELLED: {
    label: "Cancelled",
    icon: "✕",
    description: "Cancelled; no further action recorded.",
    tone: "neutral",
  },
};

export function isHelpRequestStatus(value: unknown): value is HelpRequestStatus {
  return typeof value === "string" && (HELP_REQUEST_STATUSES as readonly string[]).includes(value);
}

/** Oldest first, so the longest-waiting request is at the top. */
export function sortForTriage(requests: readonly HelpRequest[]): HelpRequest[] {
  return [...requests].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

const isOptionalString = (v: unknown) => v === undefined || v === null || typeof v === "string";

/** Boundary validation for data arriving from the network. */
export function parseHelpRequest(value: unknown): HelpRequest {
  if (typeof value !== "object" || value === null) throw new TypeError("Help request must be an object");
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || v.id.length === 0) throw new TypeError("Help request id missing");
  if (!isHelpRequestStatus(v.status)) throw new TypeError(`Unknown help request status: ${String(v.status)}`);
  if (typeof v.createdAt !== "string" || Number.isNaN(Date.parse(v.createdAt))) {
    throw new TypeError("Help request createdAt invalid");
  }
  if (typeof v.lastUpdatedAt !== "string" || Number.isNaN(Date.parse(v.lastUpdatedAt))) {
    throw new TypeError("Help request lastUpdatedAt invalid");
  }
  for (const key of ["priority", "acknowledgedAt", "assignedResponderId", "acknowledgedBy", "locationReference"]) {
    if (!isOptionalString(v[key])) throw new TypeError(`Help request ${key} invalid`);
  }
  return {
    id: v.id,
    status: v.status,
    createdAt: v.createdAt,
    lastUpdatedAt: v.lastUpdatedAt,
    priority: (v.priority as string | null | undefined) ?? null,
    acknowledgedAt: (v.acknowledgedAt as string | null | undefined) ?? null,
    assignedResponderId: (v.assignedResponderId as string | null | undefined) ?? null,
    acknowledgedBy: (v.acknowledgedBy as string | null | undefined) ?? null,
    locationReference: (v.locationReference as string | null | undefined) ?? null,
  };
}
