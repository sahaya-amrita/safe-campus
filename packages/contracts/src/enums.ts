import { z } from 'zod';

export const roleSchema = z.enum([
  'STUDENT',
  'RESPONDER',
  'INCIDENT_VERIFIER',
  'DRILL_MANAGER',
  'ADMIN',
]);
export type Role = z.infer<typeof roleSchema>;

export const studentCheckInStatusSchema = z.enum([
  'CONFIRMED_SAFE',
  'HELP_REQUESTED',
  'UNCONFIRMED',
]);
export type StudentCheckInStatus = z.infer<typeof studentCheckInStatusSchema>;

export const messageDeliveryStatusSchema = z.enum([
  'LOCAL_ONLY',
  'QUEUED',
  'SENDING',
  'SERVER_RECEIVED',
  'ACKNOWLEDGED',
  'FAILED',
]);
export type MessageDeliveryStatus = z.infer<typeof messageDeliveryStatusSchema>;

export const hazardVerificationStatusSchema = z.enum([
  'REPORTED',
  'CORROBORATED',
  'VERIFIED',
  'RESOLVED',
  'DISMISSED',
]);
export type HazardVerificationStatus = z.infer<typeof hazardVerificationStatusSchema>;

export const operatingModeSchema = z.enum(['DEMO', 'DRILL', 'TEST', 'SIMULATION']);
export type OperatingMode = z.infer<typeof operatingModeSchema>;

export const incidentPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type IncidentPriority = z.infer<typeof incidentPrioritySchema>;

export const dispatchStatusSchema = z.enum([
  'CREATED',
  'NOTIFIED',
  'ACCEPTED',
  'EN_ROUTE',
  'ON_SCENE',
  'COMPLETED',
  'ESCALATED',
  'CANCELLED',
  'FAILED',
]);
export type DispatchStatus = z.infer<typeof dispatchStatusSchema>;

export const alertStatusSchema = z.enum([
  'DRAFT',
  'AUTHORIZED',
  'QUEUED',
  'CANCELLED',
  'ALL_CLEAR',
]);
export type AlertStatus = z.infer<typeof alertStatusSchema>;

export const responderAvailabilitySchema = z.enum(['AVAILABLE', 'BUSY', 'OFF_DUTY']);
export const consentStatusSchema = z.enum(['PENDING', 'VERIFIED', 'REVOKED']);
export const drillStatusSchema = z.enum(['DRAFT', 'AUTHORIZED', 'ACTIVE', 'COMPLETED', 'REVIEWED']);

export const helpRequestStatusSchema = z.enum([
  'OPEN',
  'ACKNOWLEDGED',
  'ASSIGNED',
  'RESOLVED',
  'CANCELLED',
]);
export type HelpRequestStatus = z.infer<typeof helpRequestStatusSchema>;

export const instructionPackApprovalStateSchema = z.enum([
  'DRAFT',
  'APPROVED',
  'REJECTED',
  'PUBLISHED',
  'RETIRED',
]);
export type InstructionPackApprovalState = z.infer<typeof instructionPackApprovalStateSchema>;

export const verificationTransitions: Readonly<
  Record<HazardVerificationStatus, readonly HazardVerificationStatus[]>
> = {
  REPORTED: ['CORROBORATED', 'VERIFIED', 'DISMISSED'],
  CORROBORATED: ['VERIFIED', 'DISMISSED'],
  VERIFIED: ['RESOLVED'],
  RESOLVED: [],
  DISMISSED: [],
};

export const dispatchTransitions: Readonly<Record<DispatchStatus, readonly DispatchStatus[]>> = {
  CREATED: ['NOTIFIED', 'ESCALATED', 'CANCELLED', 'FAILED'],
  NOTIFIED: ['ACCEPTED', 'ESCALATED', 'CANCELLED', 'FAILED'],
  ACCEPTED: ['EN_ROUTE', 'CANCELLED', 'FAILED'],
  EN_ROUTE: ['ON_SCENE', 'CANCELLED', 'FAILED'],
  ON_SCENE: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  ESCALATED: ['ACCEPTED', 'CANCELLED', 'FAILED'],
  CANCELLED: [],
  FAILED: ['ESCALATED'],
};

export const helpRequestTransitions: Readonly<
  Record<HelpRequestStatus, readonly HelpRequestStatus[]>
> = {
  OPEN: ['ACKNOWLEDGED', 'ASSIGNED', 'CANCELLED'],
  ACKNOWLEDGED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['RESOLVED', 'CANCELLED'],
  RESOLVED: [],
  CANCELLED: [],
};
