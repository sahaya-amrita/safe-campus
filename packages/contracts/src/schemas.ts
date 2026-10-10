import { z } from 'zod';
import {
  consentStatusSchema,
  drillStatusSchema,
  hazardVerificationStatusSchema,
  helpRequestStatusSchema,
  incidentPrioritySchema,
  instructionPackApprovalStateSchema,
  messageDeliveryStatusSchema,
  operatingModeSchema,
  responderAvailabilitySchema,
  roleSchema,
  studentCheckInStatusSchema,
} from './enums.js';

export const uuidSchema = z.string().uuid();
export const utcTimestampSchema = z.string().datetime({ offset: true });

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }),
});

export const userSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  displayName: z.string(),
  language: z.enum(['en', 'ta']),
  roles: z.array(roleSchema),
  mode: operatingModeSchema,
});

export const createIncidentSchema = z.object({
  type: z.string().min(2).max(80),
  description: z.string().min(3).max(2000),
  priority: incidentPrioritySchema,
  buildingId: uuidSchema.optional(),
  floorId: uuidSchema.optional(),
  zoneId: uuidSchema.optional(),
  occurredAt: utcTimestampSchema.optional(),
  evidence: z
    .array(
      z.object({
        objectKey: z.string().min(1).max(500),
        mediaType: z.enum(['image/jpeg', 'image/png', 'video/mp4']),
        sizeBytes: z.number().int().positive().max(10_000_000),
        sha256: z.string().regex(/^[a-f0-9]{64}$/i),
      }),
    )
    .max(4)
    .default([]),
});

export const addIncidentReportSchema = z.object({
  description: z.string().min(3).max(2000),
  zoneId: uuidSchema.optional(),
  observedAt: utcTimestampSchema.optional(),
});

export const reviewIncidentSchema = z.object({
  status: z.enum(['CORROBORATED', 'VERIFIED', 'RESOLVED', 'DISMISSED']),
  reason: z.string().min(5).max(1000),
  evidenceIds: z.array(uuidSchema).max(20).default([]),
});

export const submitCheckInSchema = z
  .object({
    incidentId: uuidSchema.optional(),
    drillId: uuidSchema.optional(),
    status: z.enum(['CONFIRMED_SAFE', 'HELP_REQUESTED']),
    helpDetails: z.string().min(3).max(1000).optional(),
    clientCreatedAt: utcTimestampSchema,
    clientActionId: uuidSchema,
  })
  .refine((value) => Boolean(value.incidentId) !== Boolean(value.drillId), {
    message: 'Exactly one of incidentId or drillId is required',
  })
  .refine((value) => value.status !== 'HELP_REQUESTED' || Boolean(value.helpDetails), {
    message: 'helpDetails is required for HELP_REQUESTED',
  });

export const latestCheckInQuerySchema = z
  .object({
    incidentId: uuidSchema.optional(),
    drillId: uuidSchema.optional(),
  })
  .refine((value) => Boolean(value.incidentId) !== Boolean(value.drillId), {
    message: 'Exactly one of incidentId or drillId is required',
  });

export const appropriateResponderQuerySchema = z.object({
  zoneId: uuidSchema.optional(),
  qualification: z.string().min(1).max(120).optional(),
});

export const cursorPaginationSchema = z.object({
  cursor: z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const helpRequestListQuerySchema = cursorPaginationSchema.extend({
  status: helpRequestStatusSchema.optional(),
});

export const assignHelpRequestSchema = z.object({
  responderId: uuidSchema.optional(),
});

export const createInstructionPackSchema = z.object({
  version: z.string().min(1).max(80),
  language: z.enum(['en', 'ta']),
  title: z.string().min(3).max(200),
  content: z.record(z.string(), z.unknown()),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  sourceLabel: z.string().min(3).max(200),
  sourceReference: z.string().max(500).optional(),
  expiresAt: utcTimestampSchema.optional(),
});

export const reviewInstructionPackSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  notes: z.string().min(3).max(2000),
});

export const instructionPackListQuerySchema = cursorPaginationSchema.extend({
  language: z.enum(['en', 'ta']).optional(),
});

export const createAlertSchema = z.object({
  incidentId: uuidSchema.optional(),
  zoneIds: z.array(uuidSchema).min(1).max(100),
  title: z.string().min(3).max(140),
  message: z.string().min(3).max(2000),
  precautionary: z.boolean(),
  mode: operatingModeSchema,
});

export const createTrustedContactSchema = z.object({
  name: z.string().min(2).max(120),
  contactChannel: z.enum(['EMAIL', 'PHONE']),
  contactValue: z.string().min(3).max(254),
  notificationPreferences: z.object({
    incidentUpdates: z.boolean().default(false),
    helpRequests: z.boolean().default(false),
  }),
});

export const updateTrustedContactSchema = z.object({
  consentStatus: consentStatusSchema.optional(),
  notificationPreferences: z
    .object({ incidentUpdates: z.boolean(), helpRequests: z.boolean() })
    .optional(),
});

export const createDrillSchema = z.object({
  name: z.string().min(3).max(160),
  buildingId: uuidSchema,
  scenarioRef: z.string().min(1).max(200),
  scenarioVersion: z.string().min(1).max(40),
  mode: z.enum(['DRILL', 'TEST', 'SIMULATION']),
  assumptions: z.record(z.string(), z.unknown()).default({}),
});

export const trainingResultSchema = z.object({
  drillId: uuidSchema.optional(),
  scenarioRef: z.string().min(1).max(200),
  scenarioVersion: z.string().min(1).max(40),
  score: z.number().min(0).max(100),
  answers: z.record(z.string(), z.unknown()),
});

export const domainEntitySchemas = {
  building: z.object({ id: uuidSchema, name: z.string(), mode: operatingModeSchema }),
  floor: z.object({ id: uuidSchema, buildingId: uuidSchema, name: z.string() }),
  zone: z.object({ id: uuidSchema, floorId: uuidSchema, name: z.string() }),
  incident: z.object({
    id: uuidSchema,
    priority: incidentPrioritySchema,
    verificationStatus: hazardVerificationStatusSchema,
    mode: operatingModeSchema,
    createdAt: utcTimestampSchema,
  }),
  checkIn: z.object({
    id: uuidSchema,
    status: studentCheckInStatusSchema,
    deliveryStatus: messageDeliveryStatusSchema,
    serverReceivedAt: utcTimestampSchema,
  }),
  responder: z.object({
    id: uuidSchema,
    availability: responderAvailabilitySchema,
    verified: z.boolean(),
  }),
  drill: z.object({ id: uuidSchema, status: drillStatusSchema, mode: operatingModeSchema }),
  helpRequest: z.object({
    id: uuidSchema,
    status: helpRequestStatusSchema,
    studentId: uuidSchema,
    assignedResponderId: uuidSchema.nullable(),
    createdAt: utcTimestampSchema,
    updatedAt: utcTimestampSchema,
  }),
  instructionPack: z.object({
    id: uuidSchema,
    version: z.string(),
    language: z.enum(['en', 'ta']),
    contentHash: z.string(),
    sourceLabel: z.string(),
    approvalState: instructionPackApprovalStateSchema,
  }),
};

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type SubmitCheckInInput = z.infer<typeof submitCheckInSchema>;
