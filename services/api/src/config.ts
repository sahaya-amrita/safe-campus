import 'dotenv/config';
import { operatingModeSchema } from '@sahaya/contracts';
import { z } from 'zod';

const flag = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((value) => value === 'true' || value === '1');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().max(65535).default(3000),
    DATABASE_URL: z.string().url(),
    TEST_DATABASE_URL: z.string().url().optional(),
    JWT_SECRET: z.string().min(32),
    JWT_ISSUER: z.string().min(1).default('amrita-sahaya-demo'),
    JWT_AUDIENCE: z.string().min(1).default('amrita-sahaya-api'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    OPERATING_MODE: operatingModeSchema.default('DEMO'),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),
    /** In-process simulated outbox worker interval; 0 disables it (use `pnpm outbox:once`). */
    OUTBOX_POLL_MS: z.coerce.number().int().min(0).max(3_600_000).optional(),

    /** Reverse proxies in front of the API, so request.ip is the client address. */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).optional(),

    // --- Phase 2 authentication (defaults resolved by authSettings) ---
    /** DEMO password login. Never available in production. */
    DEMO_LOGIN_ENABLED: flag.optional(),
    /** Comma-separated domains that may self-register, e.g. "amrita.edu,cb.students.amrita.edu". */
    AUTH_ALLOWED_EMAIL_DOMAINS: z.string().optional(),
    /** disabled | dev (local mailbox, never production) | resend (HTTPS email API). */
    EMAIL_PROVIDER: z.enum(['disabled', 'dev', 'resend']).optional(),
    EMAIL_FROM: z.string().min(3).optional(),
    RESEND_API_KEY: z.string().min(10).optional(),
    OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(1800).optional(),
    OTP_RESEND_SECONDS: z.coerce.number().int().min(10).max(600).optional(),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).optional(),
    OTP_MAX_PER_HOUR: z.coerce.number().int().min(1).max(30).optional(),
  })
  .superRefine((env, context) => {
    // A hosted prototype may opt in, but only while every record is DEMO data.
    if (env.NODE_ENV === 'production' && env.DEMO_LOGIN_ENABLED && env.OPERATING_MODE !== 'DEMO')
      context.addIssue({
        code: 'custom',
        path: ['DEMO_LOGIN_ENABLED'],
        message: 'DEMO password login in production requires OPERATING_MODE=DEMO',
      });
    if (env.NODE_ENV === 'production' && env.EMAIL_PROVIDER === 'dev')
      context.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message: 'The dev mailbox cannot be used in production',
      });
    if (env.EMAIL_PROVIDER === 'resend' && (!env.RESEND_API_KEY || !env.EMAIL_FROM))
      context.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message: 'EMAIL_PROVIDER=resend needs RESEND_API_KEY and EMAIL_FROM',
      });
  });

export type Config = z.infer<typeof envSchema>;

export function loadConfig(overrides: Partial<Record<keyof Config, unknown>> = {}): Config {
  return envSchema.parse({ ...process.env, ...overrides });
}

export interface AuthSettings {
  demoLoginEnabled: boolean;
  allowedEmailDomains: string[];
  emailProvider: 'disabled' | 'dev' | 'resend';
  otpTtlSeconds: number;
  otpResendSeconds: number;
  otpMaxAttempts: number;
  otpMaxPerHour: number;
}

/** Resolved Phase 2 auth settings. Production never gets DEMO login or the dev mailbox. */
export function authSettings(config: Config): AuthSettings {
  const production = config.NODE_ENV === 'production';
  const provider = config.EMAIL_PROVIDER ?? 'disabled';
  return {
    demoLoginEnabled:
      config.DEMO_LOGIN_ENABLED === true && (!production || config.OPERATING_MODE === 'DEMO'),
    allowedEmailDomains: (config.AUTH_ALLOWED_EMAIL_DOMAINS ?? '')
      .split(',')
      .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean),
    emailProvider: production && provider === 'dev' ? 'disabled' : provider,
    otpTtlSeconds: config.OTP_TTL_SECONDS ?? 600,
    otpResendSeconds: config.OTP_RESEND_SECONDS ?? 60,
    otpMaxAttempts: config.OTP_MAX_ATTEMPTS ?? 5,
    otpMaxPerHour: config.OTP_MAX_PER_HOUR ?? 5,
  };
}
