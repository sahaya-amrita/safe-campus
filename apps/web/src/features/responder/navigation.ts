/**
 * Responder destinations for Tom, and an adapter that maps them onto the
 * dashboard's views. The shared shell can reuse RESPONDER_DESTINATIONS and
 * canAccessResponderWorkspace with its own router (see README).
 *
 * The route guard here is the client-side check for showing the workspace.
 * The server still authorizes every data request (401/403 → access notice).
 */
import type { TomDestination, TomNavigationAdapter, TomNavigationResult } from "../../components/tom/navigation";
import type { Role } from "./contracts";
import type { ResponderView } from "./ResponderDashboard";

const RESPONDER_ROLES: readonly Role[] = ["RESPONDER", "ADMIN"];

export const RESPONDER_DESTINATIONS: readonly TomDestination[] = [
  {
    id: "responder.help-requests",
    label: "Help requests",
    description: "It lists help requests by status, longest-waiting first.",
    keywords: ["help requests", "help request", "requests", "request queue", "queue", "sos"],
    roles: RESPONDER_ROLES,
  },
  {
    id: "responder.hazard-review",
    label: "Hazard review",
    description: "It lists hazard reports waiting for a human reviewer's decision.",
    keywords: ["hazard review", "hazard", "hazards", "hazard reports", "reports"],
    roles: RESPONDER_ROLES,
  },
  {
    id: "responder.roll-call",
    label: "Roll-call summary",
    description: "It shows who has checked in, for the stated scope only.",
    keywords: ["roll call", "roll-call", "rollcall", "attendance", "headcount", "head count", "check-ins", "checkins"],
    roles: RESPONDER_ROLES,
  },
  {
    id: "responder.contacts",
    label: "Contacts & resources",
    description: "It lists campus contact numbers with their source and verification status, plus official resources.",
    keywords: ["campus contacts", "contacts", "contact numbers", "phone numbers", "numbers", "directory", "resources", "security office", "clinic", "ambulance", "switchboard"],
    roles: RESPONDER_ROLES,
  },
];

const VIEW_BY_DESTINATION: Record<string, ResponderView> = {
  "responder.help-requests": "help-requests",
  "responder.hazard-review": "hazard-review",
  "responder.roll-call": "roll-call",
  "responder.contacts": "contacts",
};

export const destinationForView = (view: ResponderView): string => `responder.${view}`;

/** Client-side route guard for the responder workspace. */
export function canAccessResponderWorkspace(role: Role | null): boolean {
  return role !== null && RESPONDER_ROLES.includes(role);
}

export interface ResponderNavigationOptions {
  /** Role from the authenticated session. */
  getRole: () => Role | null;
  getView: () => ResponderView;
  setView: (view: ResponderView) => void;
  canGoBack?: () => boolean;
  goBack?: () => boolean;
}

export function createResponderNavigation(opts: ResponderNavigationOptions): TomNavigationAdapter {
  const ok: TomNavigationResult = { ok: true };
  return {
    destinations: () => RESPONDER_DESTINATIONS,
    current: () => destinationForView(opts.getView()),
    canNavigate: (id) => id in VIEW_BY_DESTINATION && canAccessResponderWorkspace(opts.getRole()),
    navigate: (id) => {
      const view = VIEW_BY_DESTINATION[id];
      if (!view) return { ok: false, reason: "NOT_REGISTERED" };
      if (!canAccessResponderWorkspace(opts.getRole())) return { ok: false, reason: "NOT_PERMITTED" };
      opts.setView(view);
      return ok;
    },
    canGoBack: () => opts.canGoBack?.() ?? false,
    back: () => (opts.goBack?.() ? ok : { ok: false, reason: "UNAVAILABLE" }),
  };
}
