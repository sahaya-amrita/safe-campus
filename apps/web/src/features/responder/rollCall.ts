import type { RollCallSnapshot } from "./contracts";

export type RollCallCompleteness =
  | { kind: "UNKNOWN_EXPECTED"; responded: number }
  | { kind: "INCOMPLETE"; responded: number; expected: number; missing: number }
  | { kind: "ALL_RESPONDED_IN_SCOPE"; responded: number; expected: number };

/**
 * Completeness is only ever reported for the stated scope. There is no
 * "campus-wide complete" outcome: the prototype has no authoritative
 * campus headcount.
 */
export function rollCallCompleteness(snapshot: RollCallSnapshot): RollCallCompleteness {
  const responded = snapshot.safeCount + snapshot.needHelpCount;
  if (snapshot.expectedCount === null || snapshot.scopeKind === "UNKNOWN") {
    return { kind: "UNKNOWN_EXPECTED", responded };
  }
  const expected = snapshot.expectedCount;
  if (responded >= expected) return { kind: "ALL_RESPONDED_IN_SCOPE", responded, expected };
  return { kind: "INCOMPLETE", responded, expected, missing: expected - responded };
}
