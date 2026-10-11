import { z } from 'zod';
import { responderAvailabilitySchema } from './enums.js';
import { uuidSchema } from './primitives.js';

/*
 * Phase 4: responder operations (duty status, roster management, matched
 * help-request inbox) and per-person roll call.
 */

export const setDutySchema = z.object({ availability: responderAvailabilitySchema });

const reason = z.string().trim().min(5).max(300);
const qualifications = z.array(z.string().trim().min(2).max(60)).max(10);

export const createResponderSchema = z.object({
  userId: uuidSchema,
  approvedRole: z.string().trim().min(2).max(80),
  zoneId: uuidSchema.nullable().optional(),
  qualifications: qualifications.default([]),
  reason,
});

export const updateResponderSchema = z
  .object({
    approvedRole: z.string().trim().min(2).max(80).optional(),
    zoneId: uuidSchema.nullable().optional(),
    qualifications: qualifications.optional(),
    reason,
  })
  .refine(
    (v) => v.approvedRole !== undefined || v.zoneId !== undefined || v.qualifications !== undefined,
    { message: 'Nothing to update' },
  );

export const verifyResponderSchema = z.object({ verified: z.boolean(), reason });

export interface ResponderView {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  approvedRole: string;
  qualifications: string[];
  zoneId: string | null;
  zoneName: string | null;
  availability: 'AVAILABLE' | 'BUSY' | 'OFF_DUTY';
  verified: boolean;
  verifiedAt: string | null;
  dutyChangedAt: string | null;
  mode: string;
}

export type RollCallStatus = 'SAFE' | 'NEEDS_HELP' | 'NO_RESPONSE';

export interface RollCallEntry {
  studentId: string;
  displayName: string;
  status: RollCallStatus;
  lastCheckInAt: string | null;
  helpRequestId: string | null;
  helpRequestStatus: string | null;
}

export interface RollCallResponse {
  scope: { kind: 'incident' | 'drill'; id: string; zoneCount: number };
  counts: Record<RollCallStatus, number>;
  items: RollCallEntry[];
  note: string;
}

export interface ResponderInboxItem {
  helpRequestId: string;
  status: string;
  priority: string | null;
  source: string;
  category: string | null;
  sameZone: boolean;
  matchedAt: string;
  seenAt: string | null;
}
