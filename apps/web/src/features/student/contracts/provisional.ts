/**
 * PROVISIONAL CONTRACT MIRROR — replace with `packages/contracts` when it exists.
 * ---------------------------------------------------------------------------
 * Section A mirrors `docs/api-contracts.md` exactly (owner: Codex 1).
 * Section B lists the minimum ASSUMPTIONS this client needs where that document
 * is silent. Each one is reported to Codex 1 for confirmation; none of them
 * should be copied into other modules.
 */

// ---------------------------------------------------------------------------
// A. From docs/api-contracts.md
// ---------------------------------------------------------------------------

export type CheckInStatus = 'SAFE' | 'NEED_HELP';

/**
 * Client-visible submission lifecycle. `ACCEPTED` means the server accepted
 * and persisted the request — NOT that a responder has seen it.
 */
export type DeliveryState = 'QUEUED_OFFLINE' | 'PENDING' | 'ACCEPTED' | 'FAILED';

export interface CheckIn {
  id: string;
  status: CheckInStatus;
  createdAt: string;
  updatedAt: string;
  deliveryState: DeliveryState;
  locationReference?: string;
  note?: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; requestId: string };
}

export interface InstructionPack {
  id: string;
  version: string;
  language: string;
  publishedAt: string;
  expiresAt?: string;
  contentHash: string;
  sourceLabel: string;
  approvalState: string;
}

export const API_PATHS = {
  checkIns: '/api/v1/check-ins',
  instructionPacks: '/api/v1/instruction-packs',
} as const;

// ---------------------------------------------------------------------------
// B. ASSUMPTIONS pending Codex 1 (not in docs/api-contracts.md yet)
// ---------------------------------------------------------------------------

/**
 * ASSUMPTION B1 — request body for POST /api/v1/check-ins: the client-settable
 * subset of `CheckIn`. Identity comes from the session. Sent with an
 * `Idempotency-Key` header; response is the stored `CheckIn` (201, or 200 on replay).
 */
export type CreateCheckInRequest = Pick<CheckIn, 'status' | 'note' | 'locationReference'>;

/**
 * ASSUMPTION B2 — `locationReference` is an RFC 5870 `geo:` URI with an
 * uncertainty parameter, e.g. `geo:11.0168,76.9558;u=35`. Only attached when
 * the student explicitly chooses to share location once.
 */
export const LOCATION_REFERENCE_SCHEME = 'geo:';

/** ASSUMPTION B3 — max note length enforced by the server. */
export const NOTE_MAX_LENGTH = 500;

/**
 * ASSUMPTION B4 — the docs say only "approved/published" packs are official
 * but do not enumerate `approvalState`. We treat exactly these as official.
 */
export const OFFICIAL_APPROVAL_STATES: ReadonlySet<string> = new Set(['APPROVED', 'PUBLISHED']);

/**
 * ASSUMPTION B5 — a non-official state for demo sample packs served by the
 * mock adapter, so demo content can be cached and shown, always labelled
 * as a sample. Any other non-official state (draft, rejected…) is never shown.
 */
export const DEMO_SAMPLE_APPROVAL_STATE = 'DEMO_SAMPLE';

/** ASSUMPTION B6 — the pack body. The docs list only metadata fields. */
export interface InstructionPackSection {
  heading: string;
  body: string;
}
export interface InstructionPackWithContent extends InstructionPack {
  sections: InstructionPackSection[];
}

/** ASSUMPTION B7 — GET /api/v1/instruction-packs?language=xx returns `{ items: [...] }`. */
export interface InstructionPackListResponse {
  items: InstructionPackWithContent[];
}
