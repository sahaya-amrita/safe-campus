/**
 * Tom assistant contract: POST /api/v1/assistant/interpret.
 * Owner of the endpoint code: Tom (Claude Code 2), integrated into the API
 * owned by Codex 1. Changes need agreement from both.
 */
import { z } from 'zod';

export const ASSISTANT_LIMITS = {
  questionMaxChars: 500,
  historyMaxTurns: 6,
  historyTurnMaxChars: 600,
  bodyMaxBytes: 8192,
  answerMaxChars: 1200,
  maxReferences: 5,
} as const;

const stripControls = (s: string) =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();

/** Stable screen ids, e.g. "responder.hazard-review", "student.check-in". */
export const assistantScreenIdSchema = z
  .string()
  .max(64)
  .regex(/^[a-z][a-z0-9-]*(\.[a-z0-9-]+){0,3}$/, 'Must be a registered screen id');

export const assistantHistoryTurnSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z
      .string()
      .transform(stripControls)
      .pipe(z.string().min(1).max(ASSISTANT_LIMITS.historyTurnMaxChars)),
  })
  .strict();

/**
 * Request. `.strict()` everywhere: a client cannot send a role, user id or
 * records. Identity and roles come only from the verified access token.
 */
export const assistantInterpretRequestSchema = z
  .object({
    question: z
      .string()
      .transform(stripControls)
      .pipe(z.string().min(1).max(ASSISTANT_LIMITS.questionMaxChars)),
    context: z
      .object({
        screen: assistantScreenIdSchema,
        locale: z.enum(['en', 'ta']).default('en'),
      })
      .strict(),
    history: z.array(assistantHistoryTurnSchema).max(ASSISTANT_LIMITS.historyMaxTurns).default([]),
  })
  .strict();
export type AssistantInterpretRequest = z.infer<typeof assistantInterpretRequestSchema>;

export const assistantResponseTypeSchema = z.enum([
  'answer',
  'clarification',
  'navigation_suggestion',
  'guided_tour',
  'safety_redirect',
  'unsupported',
  'unavailable',
]);
export type AssistantResponseType = z.infer<typeof assistantResponseTypeSchema>;

/** The only actions Tom may ever SUGGEST. None is executed by the server. */
export const assistantActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('NAVIGATE'), destinationId: assistantScreenIdSchema }).strict(),
  z.object({ type: z.literal('START_GUIDED_TOUR'), tourId: z.string().max(64) }).strict(),
  z
    .object({
      type: z.literal('OPEN_APPROVED_INSTRUCTIONS'),
      instructionPackId: z.string().max(64),
    })
    .strict(),
]);
export type AssistantAction = z.infer<typeof assistantActionSchema>;

export const assistantKnowledgeKindSchema = z.enum([
  'SCREEN_GUIDE',
  'STATUS_GLOSSARY',
  'WORKFLOW',
  'TOUR',
  'CAMPUS_CONTACT',
  'INSTRUCTION_PACK',
]);

export const assistantReferenceSchema = z
  .object({
    id: z.string().max(120),
    kind: assistantKnowledgeKindSchema,
    title: z.string().max(300),
    version: z.string().max(80),
    source: z.string().max(300),
    reviewState: z.enum(['APPROVED', 'DRAFT']),
  })
  .strict();

export const assistantFallbackReasonSchema = z.enum([
  'PROVIDER_DISABLED',
  'PROVIDER_UNCONFIGURED',
  'MODEL_UNAVAILABLE',
  'TIMEOUT',
  'RATE_LIMITED',
  'REFUSED',
  'TRUNCATED',
  'INVALID_OUTPUT',
  'UNAVAILABLE',
]);

/**
 * Honest provenance. AI = a hosted model produced the answer and it passed
 * validation. RULES = fixed rules answered on purpose (emergencies, action
 * requests). FALLBACK = the model was unavailable or its output was rejected,
 * so fixed rules answered instead (fallbackReason says why).
 */
export const assistantOriginSchema = z
  .object({
    source: z.enum(['AI', 'RULES', 'FALLBACK']),
    provider: z.enum(['groq', 'mock', 'rules']),
    model: z.string().max(120).nullable(),
    fallbackReason: assistantFallbackReasonSchema.nullable(),
  })
  .strict();

export const assistantInterpretResponseSchema = z
  .object({
    type: assistantResponseTypeSchema,
    answer: z.string().max(ASSISTANT_LIMITS.answerMaxChars),
    action: assistantActionSchema.nullable(),
    references: z.array(assistantReferenceSchema).max(ASSISTANT_LIMITS.maxReferences),
    origin: assistantOriginSchema,
    generatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type AssistantInterpretResponse = z.infer<typeof assistantInterpretResponseSchema>;

/** Public, secret-free status for GET /api/v1/assistant/health. */
export const assistantHealthSchema = z
  .object({
    status: z.enum(['ready', 'degraded', 'disabled']),
    provider: z.enum(['groq', 'mock', 'disabled']),
    model: z.string().nullable(),
    modelCheck: z.enum(['ok', 'not_listed', 'unchecked', 'error']),
  })
  .strict();
