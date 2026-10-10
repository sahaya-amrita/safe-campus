import type { AppMode, Role } from "../../features/responder/contracts";

/** DEMO/DRILL may show draft app help; LIVE shows only reviewed, current content. */
export type { AppMode, Role };

/** Screen identifier supplied by the app shell, e.g. "responder.hazard-review". */
export type TomContext = string;

export type TomEntryKind = "HINT" | "FAQ" | "TOUR_STEP";

export interface TomEntry {
  id: string;
  kind: TomEntryKind;
  roles: readonly Role[];
  /** Contexts this entry applies to; "*" means every screen. */
  contexts: readonly TomContext[];
  title: string;
  body: string;
  keywords?: readonly string[];
  /** Order within a guided tour (TOUR_STEP only). */
  order?: number;
  /**
   * Tom's own knowledge base holds app-usage help only. It never contains
   * emergency procedures; those come from approved instruction packs.
   */
  contentType: "APP_HELP";
  /** Whether a named person has reviewed the copy. LIVE mode requires true. */
  review: { reviewed: boolean; reviewer?: string; reviewedAt?: string; validUntil?: string };
}

/**
 * Link to an instruction pack supplied by the app (mirrors the proposed
 * Instruction pack contract). Tom displays only APPROVED/PUBLISHED, unexpired
 * packs and never rewrites their content.
 */
export interface ApprovedInstructionLink {
  id: string;
  title: string;
  href: string;
  version: string;
  sourceLabel: string;
  approvalState: string;
  language: string;
  expiresAt?: string | null;
}
