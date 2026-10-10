/**
 * Student-side view of the shared API contract.
 * ---------------------------------------------------------------------------
 * Enums and request schemas come from `@sahaya/contracts` (owner: Codex 1).
 * The few shapes below that are not yet exported by that package are copied
 * from the API implementation (`services/api/src/routes/*.ts`) and marked
 * RESPONSE SHAPE — ask Codex 1 to export them, then import instead.
 */
import {
  submitCheckInSchema,
  type HelpRequestStatus,
  type InstructionPackApprovalState,
  type MessageDeliveryStatus,
  type OperatingMode,
  type SubmitCheckInInput,
} from '@sahaya/contracts';

export { submitCheckInSchema };
export type { HelpRequestStatus, InstructionPackApprovalState, MessageDeliveryStatus, OperatingMode, SubmitCheckInInput };

/** What a student can actively submit. `UNCONFIRMED` is the absence of a check-in. */
export type SubmittableStatus = SubmitCheckInInput['status'];

export const API_PATHS = {
  checkins: '/api/v1/checkins',
  drills: '/api/v1/drills',
  instructionPacks: '/api/v1/instruction-packs',
  alertInbox: '/api/v1/alerts/inbox',
  incidents: '/api/v1/incidents',
} as const;

/** `instructionPackListQuerySchema.language` accepts only these. Other UI languages fall back explicitly. */
export const PACK_LANGUAGES = ['en', 'ta'] as const;
export function isPackLanguage(code: string): code is (typeof PACK_LANGUAGES)[number] {
  return (PACK_LANGUAGES as readonly string[]).includes(code);
}

/** RESPONSE SHAPE — `POST /checkins` 201 body (services/api/src/routes/checkins.ts). */
export interface CheckInReceipt {
  id: string;
  status: SubmittableStatus;
  deliveryStatus: 'SERVER_RECEIVED';
  serverReceivedAt: string;
  clientActionId: string;
  /** Present for HELP_REQUESTED. `OPEN` does not mean a responder has seen it. */
  helpRequest: { id: string; status: HelpRequestStatus } | null;
}

/**
 * Every check-in must reference exactly one incident or drill
 * (`submitCheckInSchema` refine). Students can list drills; a student's
 * incident list only contains incidents they reported themselves.
 */
export interface CheckInSession {
  kind: 'drill' | 'incident';
  id: string;
  name: string;
  mode: OperatingMode;
}

/** RESPONSE SHAPE — student-visible instruction pack row (services/api/src/routes/instruction-packs.ts). */
export interface StudentInstructionPack {
  id: string;
  version: string;
  language: string;
  title: string;
  /** Free-form JSON in the contract. This client renders `{ sections: [{heading, body}] }` and `{ body }`. */
  content: Record<string, unknown>;
  contentHash: string;
  sourceLabel: string;
  sourceReference?: string | null;
  approvalState: InstructionPackApprovalState;
  publishedAt: string | null;
  expiresAt: string | null;
  /** Client-only flag set by the mock adapter. Never sent by the real API. */
  demoSample?: boolean;
}

// ---------------------------------------------------------------------------
// The student's draft, as stored on the device, and its conversion to the wire body.
// ---------------------------------------------------------------------------

export interface CapturedLocation {
  latitude: number;
  longitude: number;
  accuracyMetres: number;
  /** ISO time the device produced the fix (Geolocation `position.timestamp`). */
  capturedAt: string;
}

/** What the student entered. Stored in the offline queue; converted to the wire body at send time. */
export interface CheckInDraft {
  status: SubmittableStatus;
  /** The incident or drill the student was responding to when they pressed the button. */
  session: CheckInSession | null;
  note?: string;
  landmark?: string;
  location?: CapturedLocation;
  /** IDs of photos kept on this device (see attachments). Not uploaded — no contract yet. */
  attachmentIds?: string[];
}

export const HELP_DETAILS_MAX = 1000;
export const NOTE_MAX_LENGTH = 500;
export const LANDMARK_MAX_LENGTH = 120;

/**
 * `helpDetails` is required (≥3 chars) for HELP_REQUESTED, but a student must
 * be able to send a help request without typing. This fixed, clearly
 * client-generated text is sent instead. Reported to Codex 1 as a contract issue.
 */
export const NO_DETAILS_TEXT = 'No details given (sent with the quick help button).';

/**
 * The contract has no location field. Until it does, a location the student
 * chose to share is appended to `helpDetails` as clearly labelled lines.
 * The note is shortened first so location lines are never cut off.
 */
export function composeHelpDetails(draft: Pick<CheckInDraft, 'note' | 'landmark' | 'location'>): string {
  const extra: string[] = [];
  if (draft.landmark?.trim()) extra.push(`Location described by student: ${draft.landmark.trim()}`);
  if (draft.location) {
    const { latitude, longitude, accuracyMetres, capturedAt } = draft.location;
    extra.push(
      `Device location (±${Math.round(accuracyMetres)} m, captured ${capturedAt}): ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
    );
  }
  const suffix = extra.length ? `\n${extra.join('\n')}` : '';
  const room = HELP_DETAILS_MAX - suffix.length;
  const note = draft.note?.trim() || NO_DETAILS_TEXT;
  return `${note.slice(0, Math.max(3, room))}${suffix}`;
}

export type WireBodyResult =
  | { ok: true; body: SubmitCheckInInput }
  | { ok: false; reason: 'NO_SESSION' | 'INVALID' };

/** Builds and validates the `POST /checkins` body with the shared zod schema. */
export function toWireBody(draft: CheckInDraft, clientActionId: string, clientCreatedAt: string): WireBodyResult {
  if (!draft.session) return { ok: false, reason: 'NO_SESSION' };
  const candidate = {
    status: draft.status,
    clientActionId,
    clientCreatedAt,
    ...(draft.session.kind === 'incident' ? { incidentId: draft.session.id } : { drillId: draft.session.id }),
    ...(draft.status === 'HELP_REQUESTED' ? { helpDetails: composeHelpDetails(draft) } : {}),
  };
  const parsed = submitCheckInSchema.safeParse(candidate);
  return parsed.success ? { ok: true, body: parsed.data } : { ok: false, reason: 'INVALID' };
}

/**
 * Entries saved by the earlier build used `SAFE` / `NEED_HELP` and `locationReference`.
 * Read them tolerantly so nothing a student queued is lost after an update.
 */
export function upgradeStoredDraft(value: unknown): CheckInDraft {
  const raw = (value ?? {}) as Record<string, unknown>;
  const status =
    raw.status === 'SAFE' || raw.status === 'CONFIRMED_SAFE'
      ? 'CONFIRMED_SAFE'
      : 'HELP_REQUESTED';
  const legacyNote = typeof raw.note === 'string' ? raw.note : undefined;
  const legacyLocation = typeof raw.locationReference === 'string' ? ` (${raw.locationReference})` : '';
  return {
    status,
    session: (raw.session as CheckInSession | null | undefined) ?? null,
    ...(legacyNote || legacyLocation ? { note: `${legacyNote ?? ''}${legacyLocation}`.trim() } : {}),
    ...(typeof raw.landmark === 'string' ? { landmark: raw.landmark } : {}),
    ...(raw.location ? { location: raw.location as CapturedLocation } : {}),
    ...(Array.isArray(raw.attachmentIds) ? { attachmentIds: raw.attachmentIds as string[] } : {}),
  };
}
