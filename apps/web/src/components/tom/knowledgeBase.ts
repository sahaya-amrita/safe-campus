import type { TomEntry } from './types';

/**
 * Static app-usage help. This is NOT emergency guidance: it only explains how
 * to use screens in this prototype. Entries are drafts (review.reviewed=false)
 * until a named team member reviews them, so LIVE mode hides them.
 *
 * Contexts and destinations are the screen ids the app shell registers with
 * Tom (apps/web/src/app/responder/ResponderShell.tsx).
 */
const draft = { reviewed: false } as const;

const RESPONDER_CONTEXTS = [
  'responder.overview',
  'responder.incidents',
  'responder.help-requests',
  'responder.dispatches',
  'responder.alerts',
  'responder.packs',
  'responder.drills',
  'responder.map',
  'responder.contacts',
] as const;

const RESPONDERS = ['RESPONDER', 'ADMIN'] as const;

/** Display names for tours, keyed by tourId. */
export const TOUR_TITLES: Readonly<Record<string, string>> = {
  'responder.workspace': 'Responder workspace tour',
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
    kind: 'TOUR_STEP',
    tourId: 'responder.workspace',
    order,
    roles: RESPONDERS,
    contexts: RESPONDER_CONTEXTS,
    title,
    body,
    contentType: 'APP_HELP',
    review: draft,
    ...extra,
  };
}

const help = (
  id: string,
  kind: 'HINT' | 'FAQ',
  contexts: readonly string[],
  title: string,
  body: string,
  keywords?: string[],
): TomEntry => ({
  id,
  kind,
  roles: RESPONDERS,
  contexts,
  title,
  body,
  ...(keywords ? { keywords } : {}),
  contentType: 'APP_HELP',
  review: draft,
});

export const DEFAULT_TOM_KNOWLEDGE: readonly TomEntry[] = [
  // ---- Responder workspace tour (app navigation only)
  tourStep(
    1,
    'sections',
    'Sections',
    'Use this menu to switch between the Overview, Incidents, Help requests, Drills, the Campus map and Contacts. You can also ask Tom to take you to any of them.',
    { targetId: 'responder.nav' },
  ),
  tourStep(
    2,
    'demo',
    'Demo label',
    'This banner appears whenever the records are synthetic. Nothing you do in DEMO mode reaches anyone.',
    { targetId: 'responder.mode-banner', optional: true },
  ),
  tourStep(
    3,
    'summary',
    'At a glance',
    'How many help requests are waiting, how many are past the acknowledgement target, and how many suspected (L2) and verified (L3) hazards are open.',
    { targetId: 'control.stats', destination: 'responder.overview' },
  ),
  tourStep(
    4,
    'requests',
    'Help requests and timers',
    'Oldest unacknowledged first. Each request shows how long it has waited; the timer turns amber, then red with a prompt to escalate by phone. You acknowledge yourself. Tom never does it for you.',
    { targetId: 'control.help', destination: 'responder.overview' },
  ),
  tourStep(
    5,
    'hazards',
    'Hazard queue by level',
    'L1 is an unverified report, L2 means several people reported the same thing, L3 means a person verified it. Several reports mean “look now”, not “it is true”, and never raise an alert by themselves.',
    { targetId: 'control.hazards', destination: 'responder.overview' },
  ),
  tourStep(
    6,
    'drills',
    'Drills and STOP DRILL',
    'Check the list before starting a drill. Any staff member can press STOP DRILL to end every running drill; verifying a real incident stops drills automatically.',
    { targetId: 'drills.preflight', destination: 'responder.drills', optional: true },
  ),
  tourStep(
    7,
    'map',
    'Campus map',
    'Risk areas from incidents and alerts, and spots responders marked as blocked. Routes here are DEMO suggestions on unverified paths, never approved evacuation routes.',
    { targetId: 'map.panel', destination: 'responder.map', optional: true },
  ),
  tourStep(
    8,
    'contacts',
    'Campus contacts',
    'Each number shows its source, when it was last checked and whether the institution has confirmed it. LIVE mode hides unconfirmed numbers.',
    { targetId: 'responder.contacts-list', destination: 'responder.contacts' },
  ),
  tourStep(
    9,
    'tom',
    'Ask Tom',
    'Open Tom any time to ask a question, jump to a section, or restart this tour.',
    { targetId: 'tom.launcher' },
  ),

  // ---- Responder: help requests
  help(
    'resp-hr-hint-oldest-first',
    'HINT',
    ['responder.help-requests', 'responder.overview'],
    'Oldest requests are listed first',
    'Unacknowledged requests that have waited longest appear at the top. The timer values are DEMO placeholders; the ERT sets the real ones.',
  ),
  help(
    'resp-hr-faq-acknowledge',
    'FAQ',
    ['responder.help-requests', 'responder.overview'],
    'What does “Acknowledge” do?',
    'It asks the server to record that you have seen the request. The status changes only after the server confirms. It does not notify the student or dispatch anyone.',
    ['acknowledge', 'ack', 'seen', 'confirm', 'request'],
  ),
  help(
    'resp-hr-faq-ack-failed',
    'FAQ',
    ['responder.help-requests', 'responder.overview'],
    'My acknowledgement failed. What now?',
    'The request stays in its previous status and the error is shown. Select the action again: the retry reuses the same request key, so it cannot be recorded twice.',
    ['failed', 'error', 'retry', 'acknowledge'],
  ),
  // ---- Responder: incidents and hazard queue
  help(
    'resp-hz-hint-counts',
    'HINT',
    ['responder.incidents', 'responder.overview'],
    'Counts are not alerts',
    'Several reports about the same thing raise the level to L2 so someone looks now. They do not confirm a hazard; only a person can verify (L3).',
  ),
  help(
    'resp-hz-faq-verify',
    'FAQ',
    ['responder.incidents', 'responder.overview'],
    'Does confirming a report alert the campus?',
    'No. Confirming records your decision on the server and stops any running drill. Campus alerts are a separate two-step action by authorised staff.',
    ['verify', 'verified', 'confirm', 'alert', 'notify', 'broadcast', 'hazard'],
  ),
  help(
    'resp-hz-faq-duplicate',
    'FAQ',
    ['responder.incidents', 'responder.overview'],
    'How do I mark a duplicate?',
    'When similar open reports exist, the hazard queue shows a Duplicate button. Choose it, check the prefilled reason, and record the decision.',
    ['duplicate', 'same', 'merge', 'hazard'],
  ),
  // ---- Responder: check-ins, drills, map
  help(
    'resp-rc-hint-scope',
    'HINT',
    ['responder.overview'],
    'Unconfirmed is not missing',
    'Check-in counts cover one incident. Unconfirmed never means missing or injured: follow up by phone, a warden check or a physical roll call.',
  ),
  help(
    'resp-dr-hint-stop',
    'HINT',
    ['responder.drills'],
    'Stopping is always allowed',
    'Any staff member can stop drills. Starting needs a drill manager or admin and no verified incident open.',
  ),
  help(
    'resp-map-hint-blocked',
    'HINT',
    ['responder.map'],
    'Mark blocked spots',
    'Choose “Tap: mark blocked”, tap the spot and give a reason. Everyone’s routes avoid it until a responder clears it.',
  ),
  // ---- Responder: contacts
  help(
    'resp-ct-hint-verification',
    'HINT',
    ['responder.contacts'],
    "Check each number's status",
    'Each contact shows its source, when it was last checked, and whether the institution has confirmed it. LIVE mode hides any number the institution has not confirmed.',
  ),
  // ---- Student (navigation only)
  {
    id: 'student-faq-status',
    kind: 'FAQ',
    roles: ['STUDENT', 'VOLUNTEER'],
    contexts: ['*'],
    title: 'How do I know my check-in was received?',
    body: 'Your check-in screen shows its status. “Queued” or “Not sent” means it has not reached the server yet. Only “Accepted” means the server stored it — that is not the same as a responder seeing it.',
    keywords: ['check-in', 'checkin', 'sent', 'received', 'queued', 'status'],
    contentType: 'APP_HELP',
    review: draft,
  },
  // ---- Everyone
  {
    id: 'all-faq-what-is-tom',
    kind: 'FAQ',
    roles: ['STUDENT', 'VOLUNTEER', 'RESPONDER', 'ADMIN'],
    contexts: ['*'],
    title: 'What can Tom do?',
    body: "Tom explains how to use this app's screens. Tom cannot send alerts, contact anyone, take actions for you, or give emergency instructions.",
    keywords: ['tom', 'what', 'help', 'can', 'do'],
    contentType: 'APP_HELP',
    review: draft,
  },
];
