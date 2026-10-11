import { Router, type RequestHandler } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import {
  OTP_CODE_LENGTH,
  otpRequestSchema,
  otpVerifySchema,
  roleSchema,
  type AuthConfigResponse,
} from '@sahaya/contracts';
import { writeAudit } from '../audit.js';
import { DevMailbox, type EmailSender } from '../auth/email.js';
import { requestOtp, verifyOtp } from '../auth/otp.js';
import { authSettings, type Config } from '../config.js';
import { withTransaction, type DatabasePool } from '../db.js';
import { ApiError, unauthorized } from '../errors.js';
import { validateBody } from '../middleware.js';
import { issueAccessToken, verifyPassword } from '../security.js';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });

/**
 * Per-address limit for the public sign-in endpoints (in memory, per API
 * instance). Behind a proxy, set Express "trust proxy" so request.ip is the
 * client address.
 */
export function ipRateLimit(limit: number, windowMs: number): RequestHandler {
  const hits = new Map<string, number[]>();
  return (request, _response, next) => {
    const now = Date.now();
    const key = request.ip ?? 'unknown';
    const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
    if (recent.length >= limit) {
      next(new ApiError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Try again later.'));
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

export function authRouter(
  pool: DatabasePool,
  config: Config,
  sender: EmailSender | null,
  logger?: Logger,
) {
  const router = Router();
  const settings = authSettings(config);
  const limiter = ipRateLimit(30, 15 * 60_000);

  router.get('/config', (_request, response) => {
    const body: AuthConfigResponse = {
      methods: settings.demoLoginEnabled ? ['EMAIL_OTP', 'DEMO_PASSWORD'] : ['EMAIL_OTP'],
      allowedEmailDomains: settings.allowedEmailDomains,
      emailDelivery: sender !== null,
      codeLength: OTP_CODE_LENGTH,
      codeTtlSeconds: settings.otpTtlSeconds,
      resendAfterSeconds: settings.otpResendSeconds,
    };
    response.json(body);
  });

  router.post(
    '/otp/request',
    limiter,
    validateBody(otpRequestSchema),
    async (request, response) => {
      const { email } = otpRequestSchema.parse(request.body);
      response.status(202).json(await requestOtp(pool, config, sender, email, logger));
    },
  );

  router.post('/otp/verify', limiter, validateBody(otpVerifySchema), async (request, response) => {
    const body = otpVerifySchema.parse(request.body);
    const result = await verifyOtp(pool, config, body);
    response.status(result.created ? 201 : 200).json(result);
  });

  // DEMO password login: local development and tests only. Production never
  // registers it (config validation also rejects the flag there).
  if (settings.demoLoginEnabled) {
    router.post('/demo-login', limiter, validateBody(loginSchema), async (request, response) => {
      const body = loginSchema.parse(request.body);
      const result = await pool.query<{
        id: string;
        email: string;
        display_name: string;
        password_hash: string | null;
        language: 'en' | 'ta';
        mode: 'DEMO' | 'DRILL' | 'TEST' | 'SIMULATION';
        status: string;
      }>(
        `SELECT id, email, display_name, password_hash, language, mode, status
         FROM users WHERE email = $1`,
        [body.email.toLowerCase()],
      );
      const user = result.rows[0];
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        !user.password_hash ||
        !(await verifyPassword(body.password, user.password_hash))
      )
        throw unauthorized('Invalid credentials');
      const roleRows = await pool.query<{ role: string }>(
        'SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role',
        [user.id],
      );
      const auth = {
        id: user.id,
        email: user.email,
        roles: roleSchema.array().parse(roleRows.rows.map((row) => row.role)),
      };
      await withTransaction(pool, async (client) => {
        await client.query('UPDATE users SET last_sign_in_at = now() WHERE id = $1', [user.id]);
        await writeAudit(client, {
          actorId: user.id,
          action: 'AUTH_SIGNED_IN',
          entityType: 'user',
          entityId: user.id,
          metadata: { method: 'DEMO_PASSWORD' },
        });
      });
      response.json({
        accessToken: await issueAccessToken(config, auth),
        expiresInSeconds: 7200,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          language: user.language,
          roles: auth.roles,
          mode: user.mode,
        },
        warning: 'DEMO authentication only; not institutional SSO',
      });
    });
  } else {
    router.post('/demo-login', () => {
      throw new ApiError(404, 'ROUTE_NOT_FOUND', 'DEMO password login is not available');
    });
  }

  return router;
}

/** GET /api/v1/dev/mailbox: codes sent by the local dev mailbox. Never mounted in production. */
export function devMailboxRouter(sender: EmailSender | null) {
  const router = Router();
  router.get('/mailbox', (_request, response) => {
    response.json({
      notice: 'Local development mailbox. Nothing here was emailed.',
      items: sender instanceof DevMailbox ? sender.messages() : [],
    });
  });
  return router;
}
