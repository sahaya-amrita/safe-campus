import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Logger } from 'pino';
import { OTP_CODE_LENGTH, roleSchema, type OtpRequestResponse, type Role } from '@sahaya/contracts';
import { writeAudit } from '../audit.js';
import { authSettings, type Config } from '../config.js';
import { withTransaction, type DatabasePool } from '../db.js';
import { ApiError } from '../errors.js';
import { issueAccessToken } from '../security.js';
import type { EmailSender } from './email.js';

/**
 * Email one-time-code sign-in.
 *
 * - A request always returns the same answer, so it never reveals whether an
 *   account exists or a domain is allowed. A challenge row is stored either
 *   way (rate limits behave identically); the email goes out only when the
 *   address is eligible.
 * - Only an HMAC of the code is stored. Codes expire, allow a limited number
 *   of attempts, and a new request cancels older codes.
 * - New accounts are created only for allow-listed domains, always as STUDENT.
 *   Staff roles are granted only by an ADMIN (routes/admin.ts).
 */

const INVALID = () =>
  new ApiError(400, 'OTP_INVALID', 'The code is wrong or has expired. Request a new code.');

export function hashCode(config: Config, challengeId: string, code: string): string {
  return createHmac('sha256', config.JWT_SECRET).update(`otp:${challengeId}:${code}`).digest('hex');
}

export function generateCode(): string {
  return randomInt(0, 10 ** OTP_CODE_LENGTH)
    .toString()
    .padStart(OTP_CODE_LENGTH, '0');
}

function domainOf(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1);
}

export async function requestOtp(
  pool: DatabasePool,
  config: Config,
  sender: EmailSender | null,
  email: string,
  logger?: Logger,
): Promise<OtpRequestResponse> {
  const settings = authSettings(config);
  if (!sender)
    throw new ApiError(
      503,
      'EMAIL_DELIVERY_UNAVAILABLE',
      'Sign-in codes cannot be emailed from this server yet.',
    );

  const now = Date.now();
  const recent = await pool.query<{ created_at: Date }>(
    `SELECT created_at FROM auth_otp_challenges
     WHERE email = $1 AND created_at > $2 ORDER BY created_at DESC`,
    [email, new Date(now - 3_600_000)],
  );
  const last = recent.rows[0];
  if (last) {
    const wait = Math.ceil(
      (new Date(last.created_at).getTime() + settings.otpResendSeconds * 1000 - now) / 1000,
    );
    if (wait > 0)
      throw new ApiError(429, 'OTP_RESEND_TOO_SOON', 'Wait before asking for another code.', {
        retryAfterSeconds: wait,
      });
  }
  if (recent.rows.length >= settings.otpMaxPerHour)
    throw new ApiError(429, 'OTP_RATE_LIMITED', 'Too many codes requested. Try again later.');

  const user = (
    await pool.query<{ id: string; status: string }>(
      'SELECT id, status FROM users WHERE email = $1',
      [email],
    )
  ).rows[0];
  const eligible = user
    ? user.status === 'ACTIVE'
    : settings.allowedEmailDomains.includes(domainOf(email));
  const purpose = user ? 'SIGN_IN' : 'REGISTER';
  const code = generateCode();

  const challengeId = await withTransaction(pool, async (client) => {
    await client.query(
      `UPDATE auth_otp_challenges SET consumed_at = $2
       WHERE email = $1 AND consumed_at IS NULL`,
      [email, new Date(now)],
    );
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO auth_otp_challenges (email, purpose, code_hash, expires_at, created_at)
       VALUES ($1, $2, 'pending', $3, $4) RETURNING id`,
      [email, purpose, new Date(now + settings.otpTtlSeconds * 1000), new Date(now)],
    );
    const id = inserted.rows[0]!.id;
    await client.query('UPDATE auth_otp_challenges SET code_hash = $2 WHERE id = $1', [
      id,
      hashCode(config, id, code),
    ]);
    await writeAudit(client, {
      ...(user ? { actorId: user.id } : {}),
      action: 'AUTH_OTP_REQUESTED',
      entityType: 'auth_otp_challenge',
      entityId: id,
      metadata: { email, purpose, emailSent: eligible },
    });
    return id;
  });

  if (eligible) {
    const minutes = Math.round(settings.otpTtlSeconds / 60);
    try {
      await sender.send({
        to: email,
        subject: 'Your Amrita Sahaya sign-in code',
        text: [
          `Your Amrita Sahaya code is ${code}.`,
          `It expires in ${minutes} minutes and works once.`,
          'If you did not ask for this code, ignore this email.',
          'Amrita Sahaya is a student prototype. In an emergency, call 112.',
        ].join('\n\n'),
      });
    } catch (error) {
      logger?.error({ err: error, challengeId }, 'sign-in code email failed');
      await pool.query('UPDATE auth_otp_challenges SET consumed_at = $2 WHERE id = $1', [
        challengeId,
        new Date(),
      ]);
      throw new ApiError(503, 'EMAIL_SEND_FAILED', 'The code email could not be sent. Try again.');
    }
  }

  return {
    status: 'CODE_SENT_IF_ELIGIBLE',
    codeTtlSeconds: settings.otpTtlSeconds,
    resendAfterSeconds: settings.otpResendSeconds,
  };
}

export interface SignInResult {
  accessToken: string;
  expiresInSeconds: number;
  user: {
    id: string;
    email: string;
    displayName: string;
    language: 'en' | 'ta';
    roles: Role[];
    mode: 'DEMO' | 'DRILL' | 'TEST' | 'SIMULATION';
  };
  warning: string;
  /** True when this sign-in created the account. */
  created: boolean;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  language: 'en' | 'ta';
  mode: SignInResult['user']['mode'];
  status: string;
}

export async function verifyOtp(
  pool: DatabasePool,
  config: Config,
  input: { email: string; code: string; displayName?: string | undefined },
): Promise<SignInResult> {
  const settings = authSettings(config);
  const now = new Date();

  const challenge = (
    await pool.query<{
      id: string;
      code_hash: string;
      attempts: number;
      expires_at: Date;
    }>(
      `SELECT id, code_hash, attempts, expires_at FROM auth_otp_challenges
       WHERE email = $1 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [input.email],
    )
  ).rows[0];
  if (!challenge || new Date(challenge.expires_at).getTime() <= now.getTime()) throw INVALID();

  const attempts = challenge.attempts + 1;
  const expected = Buffer.from(challenge.code_hash, 'hex');
  const actual = Buffer.from(hashCode(config, challenge.id, input.code), 'hex');
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!matches) {
    await withTransaction(pool, async (client) => {
      await client.query(
        `UPDATE auth_otp_challenges SET attempts = $2, consumed_at = COALESCE(consumed_at, $3)
         WHERE id = $1`,
        [challenge.id, attempts, attempts >= settings.otpMaxAttempts ? now : null],
      );
      await writeAudit(client, {
        action: attempts >= settings.otpMaxAttempts ? 'AUTH_OTP_LOCKED' : 'AUTH_OTP_FAILED',
        entityType: 'auth_otp_challenge',
        entityId: challenge.id,
        metadata: { email: input.email, attempts },
      });
    });
    throw INVALID();
  }

  return withTransaction(pool, async (client) => {
    await client.query(
      'UPDATE auth_otp_challenges SET attempts = $2, consumed_at = $3 WHERE id = $1',
      [challenge.id, attempts, now],
    );
    let user = (
      await client.query<UserRow>(
        'SELECT id, email, display_name, language, mode, status FROM users WHERE email = $1',
        [input.email],
      )
    ).rows[0];
    let created = false;
    if (!user) {
      // Eligibility is checked again: codes for other domains are never sent,
      // and this keeps a guessed code from creating an account.
      if (!settings.allowedEmailDomains.includes(domainOf(input.email))) throw INVALID();
      const name = input.displayName ?? input.email.slice(0, input.email.indexOf('@'));
      user = (
        await client.query<UserRow>(
          `INSERT INTO users (email, display_name, password_hash, mode, email_verified_at)
           VALUES ($1, $2, NULL, $3, $4)
           RETURNING id, email, display_name, language, mode, status`,
          [input.email, name.slice(0, 80), config.OPERATING_MODE, now],
        )
      ).rows[0]!;
      await client.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'STUDENT')`, [
        user.id,
      ]);
      await writeAudit(client, {
        actorId: user.id,
        action: 'AUTH_ACCOUNT_CREATED',
        entityType: 'user',
        entityId: user.id,
        metadata: { method: 'EMAIL_OTP', roles: ['STUDENT'] },
      });
      created = true;
    }
    if (user.status !== 'ACTIVE')
      throw new ApiError(
        403,
        'ACCOUNT_DISABLED',
        'This account is disabled. Contact an administrator.',
      );

    await client.query(
      `UPDATE users SET last_sign_in_at = $2,
         email_verified_at = COALESCE(email_verified_at, $2), updated_at = $2
       WHERE id = $1`,
      [user.id, now],
    );
    const roles = roleSchema
      .array()
      .parse(
        (
          await client.query<{ role: string }>(
            'SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role',
            [user.id],
          )
        ).rows.map((row) => row.role),
      );
    await writeAudit(client, {
      actorId: user.id,
      action: 'AUTH_SIGNED_IN',
      entityType: 'user',
      entityId: user.id,
      metadata: { method: 'EMAIL_OTP' },
    });
    return {
      accessToken: await issueAccessToken(config, { id: user.id, email: user.email, roles }),
      expiresInSeconds: 7200,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        language: user.language,
        roles,
        mode: user.mode,
      },
      warning: 'Prototype sign-in: not institutionally approved',
      created,
    };
  });
}
