/**
 * Assistant settings, parsed separately from the core API Config so the core
 * schema (owned by Codex 1) and its tests are untouched. Fails fast at startup
 * when the provider is misconfigured.
 */
import { z } from 'zod';

/** An empty value (`GROQ_API_KEY=` as in .env.example) means "not set". */
const optionalSecret = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().min(1).optional(),
);

const assistantEnvSchema = z
  .object({
    ASSISTANT_PROVIDER: z.enum(['disabled', 'mock', 'groq']).default('disabled'),
    /** Server-side only. Never expose to the web app or VITE_* variables. */
    GROQ_API_KEY: optionalSecret,
    /** Required for groq; verified against Groq's live model list at startup. */
    GROQ_MODEL: optionalSecret,
    ASSISTANT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
    ASSISTANT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(120).default(8),
    ASSISTANT_RATE_LIMIT_PER_DAY: z.coerce.number().int().min(1).max(5000).default(150),
    /** Shared budget for all users, kept below the provider's organisation-wide quota. */
    ASSISTANT_PROVIDER_MAX_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(25),
    ASSISTANT_PROVIDER_MAX_PER_DAY: z.coerce.number().int().min(1).max(100000).default(900),
    /** DEMO only: allow unreviewed app-help drafts (labelled DRAFT). Contacts/packs are never drafts. */
    ASSISTANT_ALLOW_DRAFT_CONTENT: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .superRefine((env, ctx) => {
    if (env.ASSISTANT_PROVIDER === 'groq' && (!env.GROQ_API_KEY || !env.GROQ_MODEL)) {
      ctx.addIssue({
        code: 'custom',
        path: ['ASSISTANT_PROVIDER'],
        message: 'ASSISTANT_PROVIDER=groq requires GROQ_API_KEY and GROQ_MODEL',
      });
    }
  });

export type AssistantConfig = z.infer<typeof assistantEnvSchema>;

export function loadAssistantConfig(overrides: Record<string, unknown> = {}): AssistantConfig {
  return assistantEnvSchema.parse({ ...process.env, ...overrides });
}

/**
 * Exact allowed browser origins (comma-separated CORS_ALLOWED_ORIGINS). A bare
 * host such as "safe-campus-web.onrender.com" (as Render provides it) is
 * treated as https://host.
 */
export function loadAllowedOrigins(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return (env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean)
    .map((o) => (/^https?:\/\//.test(o) ? o : `https://${o}`));
}
