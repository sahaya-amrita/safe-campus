/**
 * Typed navigation contract between Tom and the host application.
 *
 * Tom never clicks DOM elements and never navigates to URLs. It can only ask
 * the host to open a destination the host registered, and the host decides
 * (using its own authorization, not Tom and not any language model) whether
 * that is allowed. The shared apps/web shell implements this adapter on top
 * of its router; the responder harness implements it on top of view state.
 */
import type { Role } from "./types";

export interface TomDestination {
  /** Stable id, e.g. "responder.hazard-review". Also used as Tom's context. */
  id: string;
  /** What the user sees, e.g. "Hazard review". */
  label: string;
  /** One sentence Tom reads out when taking the user there. */
  description: string;
  /** Lower-case phrases that refer to this destination in a question. */
  keywords: readonly string[];
  /** Roles the host expects to have access. Advisory only: canNavigate decides. */
  roles: readonly Role[];
}

export type TomNavigationFailure = "NOT_REGISTERED" | "NOT_PERMITTED" | "UNAVAILABLE" | "FAILED";

export type TomNavigationResult = { ok: true } | { ok: false; reason: TomNavigationFailure };

export interface TomNavigationAdapter {
  /** Destinations the host registered. Tom can reach nothing else. */
  destinations(): readonly TomDestination[];
  /** The destination currently shown, or null if none applies. */
  current(): string | null;
  /** Host authorization check (route guard / session), not a model decision. */
  canNavigate(id: string): boolean | Promise<boolean>;
  navigate(id: string): TomNavigationResult | Promise<TomNavigationResult>;
  canGoBack?(): boolean;
  back?(): TomNavigationResult | Promise<TomNavigationResult>;
}

/**
 * The only path Tom uses to navigate. It re-checks registration and asks the
 * host's authorization before navigating, and reports exactly what happened.
 */
export async function navigateSafely(
  adapter: TomNavigationAdapter | undefined,
  id: string,
): Promise<TomNavigationResult> {
  if (!adapter) return { ok: false, reason: "UNAVAILABLE" };
  if (!adapter.destinations().some((d) => d.id === id)) return { ok: false, reason: "NOT_REGISTERED" };
  try {
    if (!(await adapter.canNavigate(id))) return { ok: false, reason: "NOT_PERMITTED" };
    return await adapter.navigate(id);
  } catch {
    return { ok: false, reason: "FAILED" };
  }
}

export async function goBackSafely(adapter: TomNavigationAdapter | undefined): Promise<TomNavigationResult> {
  if (!adapter?.back || !adapter.canGoBack?.()) return { ok: false, reason: "UNAVAILABLE" };
  try {
    return await adapter.back();
  } catch {
    return { ok: false, reason: "FAILED" };
  }
}
