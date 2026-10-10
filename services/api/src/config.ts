import 'dotenv/config';
import { operatingModeSchema } from '@sahaya/contracts';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  TEST_DATABASE_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().min(1).default('amrita-sahaya-demo'),
  JWT_AUDIENCE: z.string().min(1).default('amrita-sahaya-api'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  OPERATING_MODE: operatingModeSchema.default('DEMO'),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(overrides: Partial<Record<keyof Config, unknown>> = {}): Config {
  return envSchema.parse({ ...process.env, ...overrides });
}
