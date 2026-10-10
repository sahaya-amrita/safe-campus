import { describe, expect, it } from 'vitest';
import {
  hazardVerificationStatusSchema,
  helpRequestStatusSchema,
  helpRequestTransitions,
  instructionPackApprovalStateSchema,
  messageDeliveryStatusSchema,
  studentCheckInStatusSchema,
  verificationTransitions,
} from '@sahaya/contracts';

describe('shared safety contracts', () => {
  it('keeps verification, check-in, and delivery vocabularies separate', () => {
    expect(hazardVerificationStatusSchema.safeParse('SERVER_RECEIVED').success).toBe(false);
    expect(messageDeliveryStatusSchema.safeParse('VERIFIED').success).toBe(false);
    expect(studentCheckInStatusSchema.safeParse('HELP_REQUESTED').success).toBe(true);
    expect(studentCheckInStatusSchema.safeParse('CONFIRMED_SAFE').success).toBe(true);
  });

  it('does not treat corroboration as automatic verification', () => {
    expect(verificationTransitions.REPORTED).toContain('CORROBORATED');
    expect(verificationTransitions.CORROBORATED).toContain('VERIFIED');
    expect(verificationTransitions.REPORTED).not.toContain('RESOLVED');
  });

  it('represents offline-only storage without claiming server receipt', () => {
    expect(messageDeliveryStatusSchema.parse('LOCAL_ONLY')).toBe('LOCAL_ONLY');
    expect(messageDeliveryStatusSchema.parse('SERVER_RECEIVED')).not.toBe('LOCAL_ONLY');
  });

  it('keeps help-request acknowledgment and assignment explicit', () => {
    expect(helpRequestStatusSchema.parse('OPEN')).toBe('OPEN');
    expect(helpRequestTransitions.OPEN).toContain('ACKNOWLEDGED');
    expect(helpRequestTransitions.ACKNOWLEDGED).toContain('ASSIGNED');
    expect(helpRequestTransitions.RESOLVED).toHaveLength(0);
  });

  it('requires instruction packs to pass approval before publication', () => {
    expect(instructionPackApprovalStateSchema.parse('DRAFT')).toBe('DRAFT');
    expect(instructionPackApprovalStateSchema.parse('PUBLISHED')).toBe('PUBLISHED');
    expect(instructionPackApprovalStateSchema.safeParse('OFFICIAL').success).toBe(false);
  });
});
