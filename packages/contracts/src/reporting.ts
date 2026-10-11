import { z } from 'zod';
import { incidentPrioritySchema } from './enums.js';
import { utcTimestampSchema, uuidSchema } from './primitives.js';

/*
 * Phase 3: report contract v2 (category, kind, structured location,
 * attachments), SOS outside a drill or incident, and photo attachments.
 */

export const reportCategorySchema = z.enum([
  'FIRE_SMOKE',
  'MEDICAL',
  'PERSONAL_SAFETY',
  'HAZARD',
  'OTHER',
]);
export type ReportCategory = z.infer<typeof reportCategorySchema>;

/** EMERGENCY: someone may be in danger now. CONCERN: non-urgent, reviewed later. */
export const reportKindSchema = z.enum(['EMERGENCY', 'CONCERN']);
export type ReportKind = z.infer<typeof reportKindSchema>;

export const locationMethodSchema = z.enum(['GPS', 'MANUAL', 'NONE']);
export type LocationMethod = z.infer<typeof locationMethodSchema>;

/**
 * Where the reporter is. GPS needs coordinates, accuracy and capture time;
 * MANUAL needs a landmark the reporter typed. Building and floor are separate
 * fields on the report, so either method can name them.
 */
export const reportLocationSchema = z
  .object({
    method: locationMethodSchema,
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    accuracyM: z.number().min(0).max(100_000).optional(),
    capturedAt: utcTimestampSchema.optional(),
    landmark: z.string().trim().min(2).max(200).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.method === 'GPS' &&
      (value.latitude === undefined ||
        value.longitude === undefined ||
        value.accuracyM === undefined ||
        value.capturedAt === undefined)
    )
      context.addIssue({
        code: 'custom',
        message: 'GPS locations need latitude, longitude, accuracyM and capturedAt',
      });
    if (value.method === 'MANUAL' && !value.landmark)
      context.addIssue({ code: 'custom', message: 'MANUAL locations need a landmark' });
    if (value.method === 'NONE' && (value.latitude !== undefined || value.longitude !== undefined))
      context.addIssue({ code: 'custom', message: 'NONE locations carry no coordinates' });
  });
export type ReportLocation = z.infer<typeof reportLocationSchema>;

export const MAX_ATTACHMENTS_PER_REPORT = 3;
export const MAX_ATTACHMENT_BYTES = 5_000_000;
export const attachmentMediaTypeSchema = z.enum(['image/jpeg', 'image/png']);

export const attachmentIdsSchema = z
  .array(uuidSchema)
  .max(MAX_ATTACHMENTS_PER_REPORT)
  .refine((ids) => new Set(ids).size === ids.length, { message: 'Duplicate attachment ids' });

/** Report v2 (POST /incidents). Floor is required whenever a building is named. */
export const createReportSchema = z
  .object({
    type: z.string().min(2).max(80),
    description: z.string().min(3).max(2000),
    priority: incidentPrioritySchema,
    category: reportCategorySchema.optional(),
    kind: reportKindSchema.default('EMERGENCY'),
    buildingId: uuidSchema.optional(),
    floorId: uuidSchema.optional(),
    zoneId: uuidSchema.optional(),
    occurredAt: utcTimestampSchema.optional(),
    location: reportLocationSchema.optional(),
    attachmentIds: attachmentIdsSchema.default([]),
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
  })
  .refine((value) => !value.buildingId || Boolean(value.floorId), {
    message: 'floorId is required when buildingId is given',
    path: ['floorId'],
  });
export type CreateReportInput = z.infer<typeof createReportSchema>;

/**
 * SOS outside a drill or incident (POST /sos). The server records an
 * unverified SOS incident, a help check-in and an open help request.
 */
export const sosRequestSchema = z.object({
  clientActionId: uuidSchema,
  clientCreatedAt: utcTimestampSchema,
  details: z.string().trim().min(1).max(1000).optional(),
  category: reportCategorySchema.default('OTHER'),
  location: reportLocationSchema.optional(),
  buildingId: uuidSchema.optional(),
  floorId: uuidSchema.optional(),
});
export type SosRequestInput = z.infer<typeof sosRequestSchema>;

export const linkAttachmentsSchema = z.object({ attachmentIds: attachmentIdsSchema });

export interface AttachmentView {
  id: string;
  mediaType: 'image/jpeg' | 'image/png';
  sizeBytes: number;
  sha256: string;
  status: 'STORED' | 'ATTACHED';
  createdAt: string;
}

export interface LocationView {
  method: LocationMethod;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  capturedAt: string | null;
  landmark: string | null;
}
