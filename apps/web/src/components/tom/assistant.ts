/**
 * Tom's natural-language assistant: a DETERMINISTIC intent/action registry.
 *
 * This is a functional prototype, not a language model. It maps ordinary
 * questions onto a fixed set of intents. Every reply is built from registered
 * data (approved app help, registered destinations, tours, approved instruction
 * packs). No free text from a model is ever shown as an answer.
 *
 * A backend-hosted model may later be plugged in (see TomAssistantBackend).
 * It can only PROPOSE one of these intents with ids from the registry;
 * acceptProposal() rejects anything else.
 */
import { answerQuestion, isEmergencyQuestion } from "./tomLogic";
import type { TomDestination } from "./navigation";
import type { TomEntry, TomTour } from "./types";

export type ConsequentialAction = "ACKNOWLEDGE" | "HAZARD_DECISION" | "SEND_ALERT" | "CONTACT" | "SUBMIT" | "ASSIGN_OR_CLOSE";

export type AssistantReply =
  | { kind: "EMPTY" }
  | { kind: "EXPLAIN_SCREEN"; destination: TomDestination | null; entries: TomEntry[] }
  | { kind: "EXPLAIN_TOPIC"; entries: TomEntry[] }
  | { kind: "NAVIGATE"; destination: TomDestination }
  | { kind: "ALREADY_HERE"; destination: TomDestination }
  | { kind: "SUGGEST_NAVIGATE"; destination: TomDestination }
  | { kind: "BACK" }
  | { kind: "TOUR"; tour: TomTour }
  | { kind: "NO_TOUR" }
  | { kind: "INSTRUCTIONS" }
  | { kind: "EMERGENCY_FALLBACK" }
  | { kind: "REFUSE_ACTION"; action: ConsequentialAction; destination: TomDestination | null }
  | { kind: "AMBIGUOUS"; destinations: TomDestination[] }
  | { kind: "UNKNOWN" };

export type AssistantIntent = Exclude<AssistantReply["kind"], "EMPTY">;

export interface AssistantContext {
  destinations: readonly TomDestination[];
  currentDestination: string | null;
  hints: readonly TomEntry[];
  faqs: readonly TomEntry[];
  tours: readonly TomTour[];
}

const norm = (q: string) => q.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

const QUESTION_START = /^(what|how|why|when|who|which|is|are|does|do|did|can i|could i|should i|may i|explain|tell me (about|what))\b/;

const POLITE = "(?:(?:hey |hi |ok |okay )?tom[,:]? |please |can you |could you |would you |will you |i want you to |go ahead and |just )*";
const ACTIONS: Array<{ re: RegExp; action: ConsequentialAction; destination: string | null }> = [
  { re: new RegExp(`^${POLITE}(acknowledge|ack)\\b`), action: "ACKNOWLEDGE", destination: "responder.help-requests" },
  { re: new RegExp(`^${POLITE}(verify|approve|reject|confirm|mark)\\b`), action: "HAZARD_DECISION", destination: "responder.hazard-review" },
  { re: new RegExp(`^${POLITE}(send|broadcast|alert|notify|announce|raise)\\b`), action: "SEND_ALERT", destination: null },
  { re: new RegExp(`^${POLITE}(call|phone|dial|text|message|email|contact|dispatch|ring)\\b`), action: "CONTACT", destination: "responder.contacts" },
  { re: new RegExp(`^${POLITE}(submit|report|file|log)\\b`), action: "SUBMIT", destination: null },
  { re: new RegExp(`^${POLITE}(assign|resolve|close|cancel|delete|dismiss)\\b`), action: "ASSIGN_OR_CLOSE", destination: null },
];

const NAV_VERB = /\b(go to|goto|take me|bring me|open|show|navigate|switch to|jump to|move to|head to|view|see|find|where (is|are|can i find|do i find))\b/;
const BACK = /^(go |take me )?back\b|\b(previous|last) (view|page|screen|section)\b|\breturn to (the )?(previous|last)\b|\bgo back\b/;
const TOUR = /\b(tour|walk ?me ?through|walkthrough|show me around|guide me|onboard(ing)?|getting started|how does this (app|workspace) work)\b/;
const INSTRUCTIONS = /\b(instruction|instructions|procedure|procedures|official guidance|policy|policies|sop)\b/;
const SCREEN = /\b(this|current) (screen|page|view|section)\b|\bwhat can i do here\b|\bwhere am i\b|\bwhat am i looking at\b/;
const WHAT_IS = /^(what|what's) (is|are|does)? ?(the )?/;

const phraseRe = (k: string) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}\\b`, "g");

function matchDestinations(q: string, destinations: readonly TomDestination[]): TomDestination[] {
  return destinations.filter((d) => [d.label.toLowerCase(), ...d.keywords].some((k) => phraseRe(k).test(q)));
}

/**
 * Removes registered destination names before the emergency check, so a
 * section name such as "roll call" or "security office" is not mistaken for an
 * emergency. Words outside those names ("call", "fire", "exit") still count.
 */
function withoutDestinationNames(q: string, destinations: readonly TomDestination[]): string {
  let out = q;
  for (const d of destinations) for (const k of [d.label.toLowerCase(), ...d.keywords]) out = out.replace(phraseRe(k), " ");
  return out;
}

export function interpret(question: string, ctx: AssistantContext): AssistantReply {
  const q = norm(question);
  if (!q) return { kind: "EMPTY" };
  const isQuestion = QUESTION_START.test(q);
  const dests = matchDestinations(q, ctx.destinations);
  const current = ctx.destinations.find((d) => d.id === ctx.currentDestination) ?? null;

  // 1. Explicit navigation to a registered destination.
  if (NAV_VERB.test(q) && dests.length === 1) {
    const d = dests[0]!;
    return d.id === ctx.currentDestination ? { kind: "ALREADY_HERE", destination: d } : { kind: "NAVIGATE", destination: d };
  }
  if (NAV_VERB.test(q) && dests.length > 1) return { kind: "AMBIGUOUS", destinations: dests };

  // 2. Anything that sounds like an emergency gets the safe fallback.
  if (isEmergencyQuestion(withoutDestinationNames(q, ctx.destinations))) return { kind: "EMERGENCY_FALLBACK" };

  // 3. Requests to perform a consequential action are refused.
  if (!isQuestion) {
    for (const a of ACTIONS) {
      if (a.re.test(q)) {
        const destination = a.destination ? ctx.destinations.find((d) => d.id === a.destination) ?? null : null;
        return { kind: "REFUSE_ACTION", action: a.action, destination };
      }
    }
  }

  if (BACK.test(q)) return { kind: "BACK" };
  if (TOUR.test(q)) {
    const tour = ctx.tours.find((t) => t.steps.length > 0);
    return tour ? { kind: "TOUR", tour } : { kind: "NO_TOUR" };
  }
  if (INSTRUCTIONS.test(q)) return { kind: "INSTRUCTIONS" };
  if (SCREEN.test(q)) return { kind: "EXPLAIN_SCREEN", destination: current, entries: [...ctx.hints, ...ctx.faqs] };

  // "What is hazard review?" -> describe it and offer to go there.
  if (WHAT_IS.test(q) && dests.length === 1) {
    const d = dests[0]!;
    return d.id === ctx.currentDestination ? { kind: "EXPLAIN_SCREEN", destination: d, entries: [...ctx.hints, ...ctx.faqs] } : { kind: "SUGGEST_NAVIGATE", destination: d };
  }

  // 4. Grounded answers from approved app help.
  const faq = answerQuestion(q, ctx.faqs);
  if (faq.kind === "MATCH") return { kind: "EXPLAIN_TOPIC", entries: faq.entries };

  // 5. A destination named without a verb: offer it, don't go automatically.
  if (dests.length === 1) {
    const d = dests[0]!;
    return d.id === ctx.currentDestination ? { kind: "ALREADY_HERE", destination: d } : { kind: "SUGGEST_NAVIGATE", destination: d };
  }
  if (dests.length > 1) return { kind: "AMBIGUOUS", destinations: dests };
  return { kind: "UNKNOWN" };
}

// ---------------------------------------------------------------------------
// Optional backend-hosted model (not configured in this prototype)
// ---------------------------------------------------------------------------

/**
 * What a backend model may return: an intent from this registry plus ids.
 * It never returns user-facing text.
 */
export interface AssistantProposal {
  intent: AssistantIntent;
  destinationId?: string;
  entryIds?: string[];
  tourId?: string;
}

/**
 * The minimal, non-sensitive input a backend receives: the question, the
 * user's role and screen, and the ids/labels of registered items. No incident,
 * student, location or contact data is ever included.
 */
export interface AssistantBackendInput {
  question: string;
  role: string;
  context: string;
  destinations: Array<{ id: string; label: string }>;
  helpTopics: Array<{ id: string; title: string }>;
  tours: Array<{ id: string; title: string }>;
}

/**
 * A backend adapter. Implementations must call a same-origin server endpoint
 * that holds any model credentials; API keys must never be in browser code.
 */
export interface TomAssistantBackend {
  readonly status: "DISABLED" | "MOCK" | "CONFIGURED";
  interpret(input: AssistantBackendInput): Promise<AssistantProposal>;
}

export const disabledAssistantBackend: TomAssistantBackend = {
  status: "DISABLED",
  interpret: () => Promise.reject(new Error("Assistant backend disabled")),
};

export function buildBackendInput(question: string, role: string, context: string, ctx: AssistantContext): AssistantBackendInput {
  return {
    question: question.slice(0, 300),
    role,
    context,
    destinations: ctx.destinations.map((d) => ({ id: d.id, label: d.label })),
    helpTopics: ctx.faqs.map((f) => ({ id: f.id, title: f.title })),
    tours: ctx.tours.map((t) => ({ id: t.id, title: t.title })),
  };
}

/**
 * Turns a backend proposal into a reply ONLY if every id refers to registered,
 * visible content. Unknown intents or ids, and any attempt at a consequential
 * action, fall back to UNKNOWN or a refusal.
 */
export function acceptProposal(p: AssistantProposal, ctx: AssistantContext): AssistantReply {
  const dest = p.destinationId ? ctx.destinations.find((d) => d.id === p.destinationId) : undefined;
  switch (p.intent) {
    case "NAVIGATE":
    case "SUGGEST_NAVIGATE":
      // A model may only suggest; the user confirms with a click.
      return dest ? { kind: "SUGGEST_NAVIGATE", destination: dest } : { kind: "UNKNOWN" };
    case "EXPLAIN_TOPIC": {
      const entries = ctx.faqs.filter((f) => p.entryIds?.includes(f.id));
      return entries.length > 0 ? { kind: "EXPLAIN_TOPIC", entries } : { kind: "UNKNOWN" };
    }
    case "TOUR": {
      const tour = ctx.tours.find((t) => t.id === p.tourId);
      return tour ? { kind: "TOUR", tour } : { kind: "UNKNOWN" };
    }
    case "EMERGENCY_FALLBACK":
      return { kind: "EMERGENCY_FALLBACK" };
    case "INSTRUCTIONS":
      return { kind: "INSTRUCTIONS" };
    case "BACK":
      return { kind: "BACK" };
    default:
      return { kind: "UNKNOWN" };
  }
}
