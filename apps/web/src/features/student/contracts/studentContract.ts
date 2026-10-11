/**
 * Student-side view of the shared API contract.
 * ---------------------------------------------------------------------------
 * Enums and request schemas come from `@sahaya/contracts` (owner: Codex 1).
 * The few shapes below that are not yet exported by that package are copied
 * from the API implementation (`services/api/src/routes/*.ts`) and marked
 * RESPONSE SHAPE — ask Codex 1 to export them, then import instead.
 */
import {
  sosRequestSchema,
  submitCheckInSchema,
  type ReportLocation,
  type SosRequestInput,
  type HelpRequestStatus,
  type InstructionPackApprovalState,
  type MessageDeliveryStatus,
  type OperatingMode,
  type SubmitCheckInInput,
} from '@sahaya/contracts';

export { submitCheckInSchema };
export type {
  HelpRequestStatus,
  InstructionPackApprovalState,
  MessageDeliveryStatus,
  OperatingMode,
  SubmitCheckInInput,
};

/** What a student can actively submit. `UNCONFIRMED` is the absence of a check-in. */
export type SubmittableStatus = SubmitCheckInInput['status'];

export const API_PATHS = {
  checkins: '/api/v1/checkins',
  drills: '/api/v1/drills',
  instructionPacks: '/api/v1/instruction-packs',
  alertInbox: '/api/v1/alerts/inbox',
  incidents: '/api/v1/incidents',
  sos: '/api/v1/sos',
  attachments: '/api/v1/attachments',
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
  /** IDs of photos on this device. Uploaded after the server receives the request (Phase 3). */
  attachmentIds?: string[];
}

export const HELP_DETAILS_MAX = 1000;
export const NOTE_MAX_LENGTH = 500;
export const LANDMARK_MAX_LENGTH = 120;

/** What the server records when a quick help request carries no text (Phase 3). */
export const NO_DETAILS_TEXT = 'No details given (quick help request).';

/**
 * The student's own words for `helpDetails`, or undefined for a quick help
 * request (the server records "No details given"). Location is no longer
 * folded into this text: it travels as the structured `location` field.
 */
export function composeHelpDetails(draft: Pick<CheckInDraft, 'note'>): string | undefined {
  const note = draft.note?.trim();
  if (!note) return undefined;
  const text = note.length >= 3 ? note : `Note: ${note}`;
  return text.slice(0, HELP_DETAILS_MAX);
}

/**
 * The structured location the student chose (report contract v2): a device
 * fix (with the typed landmark, if any) or a typed landmark alone.
 */
export function toWireLocation(
  draft: Pick<CheckInDraft, 'landmark' | 'location'>,
): ReportLocation | undefined {
  const landmark = draft.landmark?.trim();
  const usableLandmark = landmark && landmark.length >= 2 ? landmark.slice(0, 200) : undefined;
  if (draft.location) {
    const { latitude, longitude, accuracyMetres, capturedAt } = draft.location;
    return {
      method: 'GPS',
      latitude,
      longitude,
      accuracyM: Math.round(accuracyMetres * 10) / 10,
      capturedAt,
      ...(usableLandmark ? { landmark: usableLandmark } : {}),
    };
  }
  return usableLandmark ? { method: 'MANUAL', landmark: usableLandmark } : undefined;
}

export type WireBodyResult =
  { ok: true; body: SubmitCheckInInput } | { ok: false; reason: 'NO_SESSION' | 'INVALID' };

/** Builds and validates the `POST /checkins` body with the shared zod schema. */
export function toWireBody(
  draft: CheckInDraft,
  clientActionId: string,
  clientCreatedAt: string,
): WireBodyResult {
  if (!draft.session) return { ok: false, reason: 'NO_SESSION' };
  const candidate = {
    status: draft.status,
    clientActionId,
    clientCreatedAt,
    ...(draft.session.kind === 'incident'
      ? { incidentId: draft.session.id }
      : { drillId: draft.session.id }),
    ...(draft.status === 'HELP_REQUESTED'
      ? optional('helpDetails', composeHelpDetails(draft))
      : {}),
    ...optional('location', toWireLocation(draft)),
  };
  const parsed = submitCheckInSchema.safeParse(candidate);
  return parsed.success ? { ok: true, body: parsed.data } : { ok: false, reason: 'INVALID' };
}

function optional<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

export type SosBodyResult = { ok: true; body: SosRequestInput } | { ok: false; reason: 'INVALID' };

/**
 * `POST /sos`: a help request when no drill or incident is open. The server
 * records it as an unverified SOS and an open help request.
 */
export function toSosBody(
  draft: CheckInDraft,
  clientActionId: string,
  clientCreatedAt: string,
): SosBodyResult {
  const parsed = sosRequestSchema.safeParse({
    clientActionId,
    clientCreatedAt,
    ...optional('details', composeHelpDetails(draft)),
    ...optional('location', toWireLocation(draft)),
  });
  return parsed.success ? { ok: true, body: parsed.data } : { ok: false, reason: 'INVALID' };
}

/**
 * Entries saved by the earlier build used `SAFE` / `NEED_HELP` and `locationReference`.
 * Read them tolerantly so nothing a student queued is lost after an update.
 */
export function upgradeStoredDraft(value: unknown): CheckInDraft {
  const raw = (value ?? {}) as Record<string, unknown>;
  const status =
    raw.status === 'SAFE' || raw.status === 'CONFIRMED_SAFE' ? 'CONFIRMED_SAFE' : 'HELP_REQUESTED';
  const legacyNote = typeof raw.note === 'string' ? raw.note : undefined;
  const legacyLocation =
    typeof raw.locationReference === 'string' ? ` (${raw.locationReference})` : '';
  return {
    status,
    session: (raw.session as CheckInSession | null | undefined) ?? null,
    ...(legacyNote || legacyLocation
      ? { note: `${legacyNote ?? ''}${legacyLocation}`.trim() }
      : {}),
    ...(typeof raw.landmark === 'string' ? { landmark: raw.landmark } : {}),
    ...(raw.location ? { location: raw.location as CapturedLocation } : {}),
    ...(Array.isArray(raw.attachmentIds) ? { attachmentIds: raw.attachmentIds as string[] } : {}),
  };
}
