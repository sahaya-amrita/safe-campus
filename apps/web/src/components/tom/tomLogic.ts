import type { AppMode, ApprovedInstructionLink, Role, TomContext, TomEntry } from "./types";

const PUBLISHED_STATES = new Set(["APPROVED", "PUBLISHED"]);

export function isVisible(
  entry: TomEntry,
  role: Role,
  context: TomContext,
  mode: AppMode,
  now: Date = new Date(),
): boolean {
  if (entry.contentType !== "APP_HELP") return false;
  if (!entry.roles.includes(role)) return false;
  if (!entry.contexts.includes("*") && !entry.contexts.includes(context)) return false;
  if (mode === "LIVE") {
    // LIVE: reviewed and still current only.
    if (!entry.review.reviewed) return false;
    if (entry.review.validUntil) {
      const t = Date.parse(entry.review.validUntil);
      if (Number.isNaN(t) || t <= now.getTime()) return false;
    }
  }
  return true;
}

export function selectEntries(
  kb: readonly TomEntry[],
  opts: { role: Role; context: TomContext; mode: AppMode; now?: Date },
) {
  const visible = kb.filter((e) => isVisible(e, opts.role, opts.context, opts.mode, opts.now));
  return {
    hints: visible.filter((e) => e.kind === "HINT"),
    faqs: visible.filter((e) => e.kind === "FAQ"),
    tour: visible.filter((e) => e.kind === "TOUR_STEP").sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  };
}

/** Only approved/published, unexpired packs with recorded source and version. */
export function usableInstructions(
  links: readonly ApprovedInstructionLink[] | undefined,
  now: Date = new Date(),
): ApprovedInstructionLink[] {
  return (links ?? []).filter((l) => {
    if (!PUBLISHED_STATES.has(l.approvalState)) return false;
    if (!l.sourceLabel?.trim() || !l.version?.trim() || !l.href?.trim()) return false;
    if (l.expiresAt) {
      const t = Date.parse(l.expiresAt);
      if (Number.isNaN(t) || t <= now.getTime()) return false;
    }
    return true;
  });
}

const EMERGENCY_TERMS = [
  "emergency", "fire", "smoke", "flood", "earthquake", "evacuate", "evacuation", "exit", "route", "escape",
  "injured", "injury", "hurt", "bleeding", "unconscious", "ambulance", "police", "danger", "attack", "threat",
  "weapon", "gas", "leak", "trapped", "assembly", "shelter", "lockdown", "contact", "phone", "number", "call",
  "dying", "unsafe", "chemical", "explosion",
];

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean);
}

export function isEmergencyQuestion(question: string): boolean {
  const tokens = new Set(tokenize(question));
  return EMERGENCY_TERMS.some((t) => tokens.has(t)) || /help\s+(me|now|us)|need\s+help/i.test(question);
}

export type TomAnswer =
  | { kind: "EMPTY" }
  | { kind: "EMERGENCY_FALLBACK" }
  | { kind: "MATCH"; entries: TomEntry[] }
  | { kind: "UNKNOWN" };

const STOPWORDS = new Set(["the", "a", "an", "i", "is", "do", "does", "how", "what", "my", "to", "of", "it", "this", "can", "in", "on", "and", "or"]);

/**
 * Keyword lookup over reviewed/visible FAQ entries. Emergency-sounding
 * questions are checked first and always get the safe fallback, even if an
 * app-help entry would also match.
 */
export function answerQuestion(question: string, faqs: readonly TomEntry[]): TomAnswer {
  const q = question.trim();
  if (!q) return { kind: "EMPTY" };
  if (isEmergencyQuestion(q)) return { kind: "EMERGENCY_FALLBACK" };
  const terms = tokenize(q).filter((t) => !STOPWORDS.has(t));
  if (terms.length === 0) return { kind: "UNKNOWN" };
  const scored = faqs
    .map((e) => {
      const vocab = new Set([...(e.keywords ?? []).map((k) => k.toLowerCase()), ...tokenize(e.title)].filter((t) => !STOPWORDS.has(t)));
      return { e, score: terms.filter((t) => vocab.has(t)).length };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { kind: "UNKNOWN" };
  return { kind: "MATCH", entries: scored.slice(0, 3).map((s) => s.e) };
}
