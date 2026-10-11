import { z } from 'zod';
import { roleSchema } from './enums.js';
import { uuidSchema } from './primitives.js';

/*
 * Phase 2: email one-time-code (OTP) sign-in, account status and the
 * ADMIN-only user, role and audit endpoints.
 */

export const OTP_CODE_LENGTH = 6;

/** Lower-cased, trimmed email. */
export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email()
  .transform((value) => value.toLowerCase());

export const displayNameSchema = z.string().trim().min(2).max(80);

export const otpRequestSchema = z.object({ email: emailSchema });

export const otpVerifySchema = z.object({
  email: emailSchema,
  code: z.string().regex(new RegExp(`^\\d{${OTP_CODE_LENGTH}}$`), 'Enter the 6-digit code'),
  /** Used only when the code creates a new account. */
  displayName: displayNameSchema.optional(),
});

export const authMethodSchema = z.enum(['EMAIL_OTP', 'DEMO_PASSWORD']);
export type AuthMethod = z.infer<typeof authMethodSchema>;

export interface AuthConfigResponse {
  methods: AuthMethod[];
  /** Domains allowed to self-register; existing accounts may sign in from any domain. */
  allowedEmailDomains: string[];
  /** False when no email sender is configured: OTP codes cannot be delivered. */
  emailDelivery: boolean;
  codeLength: number;
  codeTtlSeconds: number;
  resendAfterSeconds: number;
}

export interface OtpRequestResponse {
  /** Always the same, whether or not an email was sent, so accounts cannot be discovered. */
  status: 'CODE_SENT_IF_ELIGIBLE';
  codeTtlSeconds: number;
  resendAfterSeconds: number;
}

export const userStatusSchema = z.enum(['ACTIVE', 'DISABLED']);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const updateMeSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    language: z.enum(['en', 'ta']).optional(),
  })
  .refine((value) => value.displayName !== undefined || value.language !== undefined, {
    message: 'Nothing to update',
  });

/** Every consequential admin change carries a human reason for the audit log. */
export const adminReasonSchema = z.string().trim().min(5).max(300);

export const grantRoleSchema = z.object({ role: roleSchema, reason: adminReasonSchema });
export const revokeRoleSchema = z.object({ reason: adminReasonSchema });
export const setUserStatusSchema = z.object({
  status: userStatusSchema,
  reason: adminReasonSchema,
});

export const adminUserListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: roleSchema.optional(),
  status: userStatusSchema.optional(),
  cursor: z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  roles: z.infer<typeof roleSchema>[];
  status: UserStatus;
  emailVerifiedAt: string | null;
  lastSignInAt: string | null;
  createdAt: string;
}

export const auditListQuerySchema = z.object({
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(80).optional(),
  actorId: uuidSchema.optional(),
  /** Return events older than this event id. */
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export interface AuditEventView {
  id: number;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
