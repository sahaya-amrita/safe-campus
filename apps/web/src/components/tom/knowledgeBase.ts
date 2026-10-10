import type { TomEntry } from "./types";

/**
 * Static app-usage help. This is NOT emergency guidance: it only explains how
 * to use screens in this prototype. Entries are drafts (review.reviewed=false)
 * until a named team member reviews them, so LIVE mode hides them.
 */
const draft = { reviewed: false } as const;

const RESPONDER_CONTEXTS = [
  "responder.help-requests",
  "responder.hazard-review",
  "responder.roll-call",
  "responder.contacts",
] as const;

const RESPONDERS = ["RESPONDER", "ADMIN"] as const;

/** Display names for tours, keyed by tourId. */
export const TOUR_TITLES: Readonly<Record<string, string>> = {
  "responder.workspace": "Responder workspace tour",
};

function tourStep(
  order: number,
  id: string,
  title: string,
  body: string,
  extra: { targetId?: string; destination?: string; optional?: boolean },
): TomEntry {
  return {
    id: `tour-ws-${id}`,
    kind: "TOUR_STEP",
    tourId: "responder.workspace",
    order,
    roles: RESPONDERS,
    contexts: RESPONDER_CONTEXTS,
    title,
    body,
    contentType: "APP_HELP",
    review: draft,
    ...extra,
  };
}

export const DEFAULT_TOM_KNOWLEDGE: readonly TomEntry[] = [
  // ---- Responder workspace tour (app navigation only)
  tourStep(1, "sections", "Sections", "Use these to switch between Help requests, Hazard review, Roll-call summary and Contacts & resources. You can also ask Tom to take you to any of them.", { targetId: "responder.nav" }),
  tourStep(2, "summary", "Queue summary", "Counts of open help requests and hazards waiting for review, as returned by the server. “N+” means more pages exist.", { targetId: "responder.summary" }),
  tourStep(3, "demo", "Demo label", "This banner appears whenever the records are synthetic. Nothing you do in DEMO mode reaches anyone.", { targetId: "responder.mode-banner", optional: true }),
  tourStep(4, "filter", "Filter by status", "Choose which help requests to list: Open, Acknowledged, Assigned, Resolved or Cancelled.", { targetId: "responder.status-filter", destination: "responder.help-requests" }),
  tourStep(5, "requests", "Open a request", "Select “Open” on a row to see its timestamps. You acknowledge a request yourself, and the status changes only when the server confirms. Tom never does it for you.", { targetId: "responder.request-list", destination: "responder.help-requests" }),
  tourStep(6, "hazards", "Human review", "Every hazard report stays “Pending review” until a reviewer records a decision. Report counts never raise an alert.", { targetId: "responder.hazard-filter", destination: "responder.hazard-review" }),
  tourStep(7, "rollcall", "Roll-call scope", "The summary covers only the group named in “Scope”. It never declares a campus-wide roll call complete.", { targetId: "responder.rollcall-scope", destination: "responder.roll-call", optional: true }),
  tourStep(8, "contacts", "Campus contacts", "Each number shows its source, when it was last checked and whether the institution has confirmed it. LIVE mode hides unconfirmed numbers.", { targetId: "responder.contacts-list", destination: "responder.contacts" }),
  tourStep(9, "tom", "Ask Tom", "Open Tom any time to ask a question, jump to a section, or restart this tour.", { targetId: "tom.launcher" }),

  // ---- Responder: help requests
  {
    id: "resp-hr-hint-oldest-first",
    kind: "HINT",
    roles: ["RESPONDER", "ADMIN"],
    contexts: ["responder.help-requests"],
    title: "Oldest requests are listed first",
    body: "Within each status, the request that has waited longest appears at the top. Use the status filter to switch between Open, Acknowledged, Assigned, Resolved and Cancelled.",
    contentType: "APP_HELP",
    review: draft,
  },
  {
    id: "resp-hr-faq-acknowledge",
    kind: "FAQ",
    roles: ["RESPONDER", "ADMIN"],
    contexts: ["responder.help-requests"],
    title: "What does “Acknowledge” do?",
    body: "It asks the server to record that you have seen the request. The status changes only after the server confirms. In this prototype it does not notify the student or dispatch anyone.",
    keywords: ["acknowledge", "ack", "seen", "confirm", "request"],
    contentType: "APP_HELP",
    review: draft,
  },
  {
    id: "resp-hr-faq-ack-failed",
    kind: "FAQ",
    roles: ["RESPONDER", "ADMIN"],
    contexts: ["responder.help-requests"],
    title: "My acknowledgement failed. What now?",
    body: "The request stays in its previous status. Use “Retry acknowledgement”; the retry reuses the same request key so it cannot be recorded twice.",
    keywords: ["failed", "error", "retry", "acknowledge"],
    contentType: "APP_HELP",
    review: draft,
  },
  // ---- Responder: hazard review
  {
    id: "resp-hz-hint-counts",
    kind: "HINT",
    roles: ["RESPONDER", "ADMIN"],
    contexts: ["responder.hazard-review"],
    title: "Counts are not alerts",
    body: "Several reports about the same thing do not confirm a hazard. Each report stays “Pending review” until a reviewer records a decision.",
    contentType: "APP_HELP",
    review: draft,
  },
  {
    id: "resp-hz-faq-verify",
    kind: "FAQ",
    roles: ["RESPONDER", "ADMIN"],
    contexts: ["responder.hazard-review"],
    title: "Does verifying a report alert the campus?",
    body: "No. Verifying records your review on the server. Official campus notices are a separate action by authorized staff and are not sent from this screen.",
    keywords: ["verify", "verified", "alert", "notify", "broadcast", "hazard"],
    contentType: "APP_HELP",
    review: draft,
  },
  {
    id: "resp-hz-faq-duplicate",
    kind: "FAQ",
    roles: ["RESPONDER", "ADMIN"],
    contexts: ["responder.hazard-review"],
    title: "How do I mark a duplicate?",
    body: "Choose “Duplicate of another report” and enter the other report's ID, then submit the review.",
    keywords: ["duplicate", "same", "merge", "hazard"],
    contentType: "APP_HELP",
    review: draft,
  },
  // ---- Responder: roll call
  {
    id: "resp-rc-hint-scope",
    kind: "HINT",
    roles: ["RESPONDER", "ADMIN"],
    contexts: ["responder.roll-call"],
    title: "Check the scope",
    body: "The summary only covers the group named in “Scope”. It is never a campus-wide roll call.",
    contentType: "APP_HELP",
    review: draft,
  },
  // ---- Responder: contacts
  {
    id: "resp-ct-hint-verification",
    kind: "HINT",
    roles: ["RESPONDER", "ADMIN"],
    contexts: ["responder.contacts"],
    title: "Check each number's status",
    body: "Each contact shows its source, when it was last checked, and whether the institution has confirmed it. LIVE mode hides any number the institution has not confirmed.",
    contentType: "APP_HELP",
    review: draft,
  },
  // ---- Student (navigation only)
  {
    id: "student-faq-status",
    kind: "FAQ",
    roles: ["STUDENT", "VOLUNTEER"],
    contexts: ["*"],
    title: "How do I know my check-in was received?",
    body: "Your check-in screen shows its status. “Queued” or “Not sent” means it has not reached the server yet. Only “Accepted” means the server stored it — that is not the same as a responder seeing it.",
    keywords: ["check-in", "checkin", "sent", "received", "queued", "status"],
    contentType: "APP_HELP",
    review: draft,
  },
  // ---- Everyone
  {
    id: "all-faq-what-is-tom",
    kind: "FAQ",
    roles: ["STUDENT", "VOLUNTEER", "RESPONDER", "ADMIN"],
    contexts: ["*"],
    title: "What can Tom do?",
    body: "Tom explains how to use this app's screens. Tom cannot send alerts, contact anyone, take actions for you, or give emergency instructions.",
    keywords: ["tom", "what", "help", "can", "do"],
    contentType: "APP_HELP",
    review: draft,
  },
];
