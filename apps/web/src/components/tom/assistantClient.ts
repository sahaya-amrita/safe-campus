/**
 * Client for the PROPOSED assistant endpoint (see assistant-api/ASSISTANT_API_PROPOSAL.md).
 * The endpoint does not exist yet; this client is disabled unless the shell
 * passes it to <Tom assistant={...}>. It holds no credentials: the shell
 * supplies the user's access token per request. Model API keys live only on
 * the server.
 */
import type { TomDestination } from './navigation';
import type { ApprovedInstructionLink, TomTour } from './types';

/** Mirrors packages/contracts/src/assistant.ts on the API (feat/tom-assistant-api). */
export type AssistantResponseType =
  | 'answer'
  | 'clarification'
  | 'navigation_suggestion'
  | 'guided_tour'
  | 'safety_redirect'
  | 'unsupported'
  | 'unavailable';

export type AssistantAction =
  | { type: 'NAVIGATE'; destinationId: string }
  | { type: 'START_GUIDED_TOUR'; tourId: string }
  | { type: 'OPEN_APPROVED_INSTRUCTIONS'; instructionPackId: string };

export type AssistantKnowledgeKind =
  'SCREEN_GUIDE' | 'STATUS_GLOSSARY' | 'WORKFLOW' | 'TOUR' | 'CAMPUS_CONTACT' | 'INSTRUCTION_PACK';

export interface AssistantReference {
  id: string;
  kind: AssistantKnowledgeKind;
  title: string;
  version: string;
  source: string;
  reviewState: 'APPROVED' | 'DRAFT';
}

export type AssistantFallbackReason =
  | 'PROVIDER_DISABLED'
  | 'PROVIDER_UNCONFIGURED'
  | 'MODEL_UNAVAILABLE'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'REFUSED'
  | 'TRUNCATED'
  | 'INVALID_OUTPUT'
  | 'UNAVAILABLE';

export interface AssistantOrigin {
  /** AI = hosted model answered; RULES = fixed rules on purpose; FALLBACK = model unavailable/rejected. */
  source: 'AI' | 'RULES' | 'FALLBACK';
  provider: 'groq' | 'mock' | 'rules';
  model: string | null;
  fallbackReason: AssistantFallbackReason | null;
}

export interface AssistantHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantInterpretRequest {
  question: string;
  context: { screen: string; locale: 'en' | 'ta' };
  history: AssistantHistoryTurn[];
}

export interface AssistantInterpretResponse {
  type: AssistantResponseType;
  answer: string;
  action: AssistantAction | null;
  references: AssistantReference[];
  origin: AssistantOrigin;
  generatedAt: string;
}

export interface TomAssistantBackend {
  readonly status: 'DISABLED' | 'MOCK' | 'CONFIGURED';
  interpret(request: AssistantInterpretRequest): Promise<AssistantInterpretResponse>;
}

export const disabledAssistantBackend: TomAssistantBackend = {
  status: 'DISABLED',
  interpret: () => Promise.reject(new Error('Assistant backend disabled')),
};

export const QUESTION_MAX_CHARS = 500;
export const HISTORY_MAX_TURNS = 6;
export const HISTORY_TURN_MAX_CHARS = 600;

export class AssistantHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    /** Seconds, from Retry-After on 429. */
    readonly retryAfter: number | null = null,
  ) {
    super(`Assistant request failed (${code})`);
    this.name = 'AssistantHttpError';
  }
}

// ---------------------------------------------------------------------------
// Strict response validation (the web app has no schema library; keep it explicit)
// ---------------------------------------------------------------------------
const TYPES: readonly string[] = [
  'answer',
  'clarification',
  'navigation_suggestion',
  'guided_tour',
  'safety_redirect',
  'unsupported',
  'unavailable',
];
const KINDS: readonly string[] = [
  'SCREEN_GUIDE',
  'STATUS_GLOSSARY',
  'WORKFLOW',
  'TOUR',
  'CAMPUS_CONTACT',
  'INSTRUCTION_PACK',
];
const REASONS: readonly string[] = [
  'PROVIDER_DISABLED',
  'PROVIDER_UNCONFIGURED',
  'MODEL_UNAVAILABLE',
  'TIMEOUT',
  'RATE_LIMITED',
  'REFUSED',
  'TRUNCATED',
  'INVALID_OUTPUT',
  'UNAVAILABLE',
];
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = 2000): v is string => typeof v === 'string' && v.length <= max;
const onlyKeys = (o: Record<string, unknown>, keys: string[]) =>
  Object.keys(o).every((k) => keys.includes(k));

function parseAction(v: unknown): AssistantAction | null | undefined {
  if (v === null) return null;
  if (!isObj(v)) return undefined;
  if (v.type === 'NAVIGATE' && isStr(v.destinationId, 64) && onlyKeys(v, ['type', 'destinationId']))
    return { type: 'NAVIGATE', destinationId: v.destinationId };
  if (v.type === 'START_GUIDED_TOUR' && isStr(v.tourId, 64) && onlyKeys(v, ['type', 'tourId']))
    return { type: 'START_GUIDED_TOUR', tourId: v.tourId };
  if (
    v.type === 'OPEN_APPROVED_INSTRUCTIONS' &&
    isStr(v.instructionPackId, 64) &&
    onlyKeys(v, ['type', 'instructionPackId'])
  )
    return { type: 'OPEN_APPROVED_INSTRUCTIONS', instructionPackId: v.instructionPackId };
  return undefined; // any other action type is invalid
}

function parseOrigin(v: unknown): AssistantOrigin | null {
  if (!isObj(v) || !onlyKeys(v, ['source', 'provider', 'model', 'fallbackReason'])) return null;
  if (!['AI', 'RULES', 'FALLBACK'].includes(v.source as string)) return null;
  if (!['groq', 'mock', 'rules'].includes(v.provider as string)) return null;
  if (!(v.model === null || isStr(v.model, 120))) return null;
  if (!(v.fallbackReason === null || REASONS.includes(v.fallbackReason as string))) return null;
  // Consistency: only AI answers come from a model; fallbacks must say why.
  if (v.source === 'AI' && (v.provider === 'rules' || v.fallbackReason !== null)) return null;
  if (v.source === 'FALLBACK' && v.fallbackReason === null) return null;
  return {
    source: v.source as AssistantOrigin['source'],
    provider: v.provider as AssistantOrigin['provider'],
    model: v.model ?? null,
    fallbackReason: (v.fallbackReason as AssistantFallbackReason | null) ?? null,
  };
}

/** Returns a typed response or null. Unknown fields, action types or oversized values invalidate it. */
export function validateInterpretResponse(v: unknown): AssistantInterpretResponse | null {
  if (
    !isObj(v) ||
    !onlyKeys(v, ['type', 'answer', 'action', 'references', 'origin', 'generatedAt'])
  )
    return null;
  if (!isStr(v.type) || !TYPES.includes(v.type)) return null;
  if (!isStr(v.answer, 1200)) return null;
  const action = parseAction(v.action);
  if (action === undefined) return null;
  if (!Array.isArray(v.references) || v.references.length > 5) return null;
  const references: AssistantReference[] = [];
  for (const r of v.references) {
    if (!isObj(r) || !onlyKeys(r, ['id', 'kind', 'title', 'version', 'source', 'reviewState']))
      return null;
    if (!isStr(r.id, 120) || !isStr(r.title, 300) || !isStr(r.version, 80) || !isStr(r.source, 300))
      return null;
    if (
      !isStr(r.kind) ||
      !KINDS.includes(r.kind) ||
      (r.reviewState !== 'APPROVED' && r.reviewState !== 'DRAFT')
    )
      return null;
    references.push({
      id: r.id,
      kind: r.kind as AssistantKnowledgeKind,
      title: r.title,
      version: r.version,
      source: r.source,
      reviewState: r.reviewState,
    });
  }
  const origin = parseOrigin(v.origin);
  if (!origin) return null;
  if (!isStr(v.generatedAt, 40) || Number.isNaN(Date.parse(v.generatedAt))) return null;
  return {
    type: v.type as AssistantResponseType,
    answer: v.answer,
    action,
    references,
    origin,
    generatedAt: v.generatedAt,
  };
}

// ---------------------------------------------------------------------------
// HTTP adapter
// ---------------------------------------------------------------------------
export interface HttpAssistantOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Current user's access token from the shell's session. Never stored here. */
  getAccessToken?: () => string | null;
  timeoutMs?: number;
}

export class HttpTomAssistantBackend implements TomAssistantBackend {
  readonly status = 'CONFIGURED' as const;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly opts: HttpAssistantOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? '').replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl ?? ((...a) => globalThis.fetch(...a));
    this.timeoutMs = opts.timeoutMs ?? 12_000;
  }

  async interpret(request: AssistantInterpretRequest): Promise<AssistantInterpretResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const token = this.opts.getAccessToken?.();
    try {
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.baseUrl}/api/v1/assistant/interpret`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          // Only the question, screen context and bounded history: no role, user id or records.
          body: JSON.stringify({
            question: request.question.slice(0, QUESTION_MAX_CHARS),
            context: { screen: request.context.screen, locale: request.context.locale },
            history: request.history
              .slice(-HISTORY_MAX_TURNS)
              .map((t) => ({ role: t.role, content: t.content.slice(0, HISTORY_TURN_MAX_CHARS) }))
              .filter((t) => t.content.trim().length > 0),
          }),
          signal: controller.signal,
        });
      } catch {
        throw new AssistantHttpError(0, controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR');
      }
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      if (!res.ok) {
        const code =
          isObj(body) && isObj(body.error) && isStr(body.error.code, 80)
            ? body.error.code
            : `HTTP_${res.status}`;
        const retry = Number(res.headers.get('Retry-After'));
        throw new AssistantHttpError(
          res.status,
          code,
          Number.isFinite(retry) && retry > 0 ? retry : null,
        );
      }
      const parsed = validateInterpretResponse(body);
      if (!parsed) throw new AssistantHttpError(502, 'INVALID_RESPONSE');
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---------------------------------------------------------------------------
// Client-side checks on what the server suggests (defence in depth)
// ---------------------------------------------------------------------------
export type CheckedAction =
  | { type: 'NAVIGATE'; destination: TomDestination }
  | { type: 'START_GUIDED_TOUR'; tour: TomTour }
  | { type: 'OPEN_APPROVED_INSTRUCTIONS'; instruction: ApprovedInstructionLink }
  | null;

/**
 * Keeps a suggested action only if THIS client has it registered and usable:
 * a destination from the host adapter, a visible tour, or an approved,
 * unexpired instruction pack. Anything else is silently dropped.
 */
export function checkSuggestedAction(
  action: AssistantAction | null,
  ctx: {
    destinations: readonly TomDestination[];
    tours: readonly TomTour[];
    instructions: readonly ApprovedInstructionLink[];
  },
): CheckedAction {
  if (!action) return null;
  switch (action.type) {
    case 'NAVIGATE': {
      const destination = ctx.destinations.find((d) => d.id === action.destinationId);
      return destination ? { type: 'NAVIGATE', destination } : null;
    }
    case 'START_GUIDED_TOUR': {
      const tour = ctx.tours.find((t) => t.id === action.tourId);
      return tour ? { type: 'START_GUIDED_TOUR', tour } : null;
    }
    case 'OPEN_APPROVED_INSTRUCTIONS': {
      const instruction = ctx.instructions.find((i) => i.id === action.instructionPackId);
      return instruction ? { type: 'OPEN_APPROVED_INSTRUCTIONS', instruction } : null;
    }
  }
}
