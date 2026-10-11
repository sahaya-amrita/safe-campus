import type { Role } from '@sahaya/contracts';

/**
 * Plain-language names for codes shown to staff. Codes stay in the data and
 * the API; screens show these labels. Unknown codes fall back to `humanize`.
 */

export const ROLE_LABEL: Record<Role, string> = {
  STUDENT: 'Student',
  RESPONDER: 'Responder',
  INCIDENT_VERIFIER: 'Incident verifier',
  DRILL_MANAGER: 'Drill manager',
  ADMIN: 'Administrator',
};

/** "SYNTHETIC_RESPONDER" → "Synthetic responder"; "incident_verifier" → "Incident verifier". */
export function humanize(code: string): string {
  const words = code.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : code;
}

export function roleLabel(role: string): string {
  return ROLE_LABEL[role.toUpperCase() as Role] ?? humanize(role);
}

const AUDIT_ACTIONS: Record<string, string> = {
  AUTH_SIGNED_IN: 'Signed in',
  AUTH_OTP_REQUESTED: 'Sign-in code requested',
  AUTH_OTP_FAILED: 'Wrong sign-in code entered',
  AUTH_OTP_LOCKED: 'Sign-in locked after failed codes',
  AUTH_ACCOUNT_CREATED: 'Account created',
  AUTH_SIGNED_OUT_EVERYWHERE: 'Signed out everywhere',
  USER_PROFILE_UPDATED: 'Profile updated',
  USER_DISABLED: 'Account disabled',
  USER_ENABLED: 'Account enabled',
  ROLE_GRANTED: 'Role granted',
  ROLE_REVOKED: 'Role removed',
  SOS_RECEIVED: 'SOS received',
  STUDENT_CHECKIN_RECEIVED: 'Check-in received',
  INCIDENT_REPORTED: 'Incident reported',
  INCIDENT_VERIFICATION_CHANGED: 'Verification decision recorded',
  HELP_REQUEST_OPENED: 'Help request opened',
  HELP_REQUEST_ACKNOWLEDGED: 'Help request acknowledged',
  HELP_REQUEST_ASSIGNED: 'Help request assigned',
  HELP_REQUEST_RESOLVED: 'Help request resolved',
  HELP_REQUEST_CANCELLED: 'Help request cancelled',
  HELP_REQUEST_PHOTOS_ADDED: 'Photos added to a help request',
  ATTACHMENT_UPLOADED: 'Photo uploaded',
  ATTACHMENT_VIEWED: 'Photo viewed',
  UNATTACHED_PHOTOS_PURGED: 'Unused photos deleted',
  DISPATCH_ACKNOWLEDGED: 'Dispatch acknowledged',
  ALERT_DRAFTED: 'Alert drafted',
  ALERT_AUTHORIZED_FOR_SIMULATED_DELIVERY: 'Alert authorised (simulated delivery)',
  DRILL_CREATED: 'Drill created',
  DRILL_STARTED: 'Drill started',
  DRILL_STOPPED: 'Drill stopped',
  DRILL_REVIEW_SAVED: 'Drill review saved',
  INSTRUCTION_PACK_CREATED: 'Guide created',
  INSTRUCTION_PACK_PUBLISHED: 'Guide published',
  RESPONDER_PROFILE_CREATED: 'Responder added to roster',
  RESPONDER_PROFILE_UPDATED: 'Responder record updated',
  RESPONDER_DUTY_CHANGED: 'Duty status changed',
  ROLL_CALL_VIEWED: 'Roll call viewed',
  ROUTE_BLOCK_CREATED: 'Route marked blocked',
  ROUTE_BLOCK_CLEARED: 'Route block cleared',
  ROUTE_GRAPH_UPLOADED: 'Route data uploaded',
  SAFE_POINT_PROPOSED: 'Safe point proposed',
  SETTINGS_UPDATED: 'Settings changed',
  PUSH_DEVICE_REGISTERED: 'Phone notices turned on',
  PUSH_DEVICE_REMOVED: 'Phone notices turned off',
};

/** Audit actions an administrator is likely to filter by, in a sensible order. */
export const COMMON_AUDIT_ACTIONS = [
  'AUTH_SIGNED_IN',
  'ROLE_GRANTED',
  'ROLE_REVOKED',
  'USER_DISABLED',
  'SOS_RECEIVED',
  'HELP_REQUEST_ACKNOWLEDGED',
  'INCIDENT_VERIFICATION_CHANGED',
  'ALERT_AUTHORIZED_FOR_SIMULATED_DELIVERY',
  'DRILL_STARTED',
  'SETTINGS_UPDATED',
  'ATTACHMENT_VIEWED',
] as const;

export function auditActionLabel(action: string): string {
  return AUDIT_ACTIONS[action] ?? humanize(action);
}

/**
 * Audit metadata as readable "label: value" pairs. Nested objects are shown
 * compactly; nothing is dropped, so the record stays complete.
 */
export function auditDetails(metadata: unknown): { label: string; value: string }[] {
  if (!metadata || typeof metadata !== 'object') return [];
  return Object.entries(metadata as Record<string, unknown>).map(([key, value]) => ({
    label: humanize(key.replace(/([a-z])([A-Z])/g, '$1_$2')),
    value:
      value === null || value === undefined
        ? '—'
        : typeof value === 'string'
          ? /^[A-Z][A-Z0-9_]+$/.test(value)
            ? humanize(value)
            : value
          : typeof value === 'number' || typeof value === 'boolean'
            ? String(value)
            : JSON.stringify(value),
  }));
}
