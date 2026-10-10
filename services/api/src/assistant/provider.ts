/** Provider abstraction. The service and router never import a vendor SDK. */

/** What the model must return (validated again after parsing). */
export interface ModelOutput {
  type: 'answer' | 'clarification' | 'navigation_suggestion' | 'guided_tour' | 'unsupported';
  answer: string;
  action: {
    kind: 'NONE' | 'NAVIGATE' | 'START_GUIDED_TOUR' | 'OPEN_APPROVED_INSTRUCTIONS';
    target: string;
  };
  referenceIds: string[];
}

/** Minimal, non-sensitive input: no user id, token, records, locations or contact data. */
export interface ProviderInput {
  question: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  screen: string;
  screenLabel: string | null;
  locale: 'en' | 'ta';
  documents: Array<{ id: string; kind: string; title: string; body: string }>;
  destinations: Array<{ id: string; label: string }>;
  tours: Array<{ id: string; title: string }>;
  instructionPacks: Array<{ id: string; title: string }>;
}

export type ProviderFailure =
  | 'PROVIDER_UNCONFIGURED'
  | 'MODEL_UNAVAILABLE'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'REFUSED'
  | 'TRUNCATED'
  | 'INVALID_OUTPUT'
  | 'UNAVAILABLE';

export type ProviderResult = { ok: true; output: unknown } | { ok: false; reason: ProviderFailure };

export interface AssistantProvider {
  readonly name: 'groq' | 'mock';
  readonly model: string | null;
  generate(input: ProviderInput, signal: AbortSignal): Promise<ProviderResult>;
  /** Startup check that the configured model is actually offered. */
  checkModel?(): Promise<'ok' | 'not_listed' | 'error'>;
}

/** JSON Schema for structured output (Groq strict mode: all properties required, no extras). */
export const MODEL_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'answer', 'action', 'referenceIds'],
  properties: {
    type: {
      type: 'string',
      enum: ['answer', 'clarification', 'navigation_suggestion', 'guided_tour', 'unsupported'],
    },
    answer: { type: 'string' },
    action: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'target'],
      properties: {
        kind: {
          type: 'string',
          enum: ['NONE', 'NAVIGATE', 'START_GUIDED_TOUR', 'OPEN_APPROVED_INSTRUCTIONS'],
        },
        target: { type: 'string' },
      },
    },
    referenceIds: { type: 'array', items: { type: 'string' } },
  },
} as const;
