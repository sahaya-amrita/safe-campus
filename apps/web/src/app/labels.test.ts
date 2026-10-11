import { describe, expect, it } from 'vitest';
import { auditActionLabel, auditDetails, humanize, roleLabel } from './labels';

describe('plain-language labels', () => {
  it('names roles and unknown codes readably', () => {
    expect(roleLabel('INCIDENT_VERIFIER')).toBe('Incident verifier');
    expect(roleLabel('incident_verifier')).toBe('Incident verifier');
    expect(roleLabel('ADMIN')).toBe('Administrator');
    expect(humanize('SYNTHETIC_RESPONDER')).toBe('Synthetic responder');
  });

  it('names audit actions, falling back for codes it does not know', () => {
    expect(auditActionLabel('AUTH_SIGNED_IN')).toBe('Signed in');
    expect(auditActionLabel('ROUTE_GRAPH_APPROVED')).toBe('Route graph approved');
  });

  it('turns audit metadata into labelled values without dropping anything', () => {
    expect(
      auditDetails({
        method: 'DEMO_PASSWORD',
        respondersNotified: 2,
        note: 'Checked',
        extra: { a: 1 },
      }),
    ).toEqual([
      { label: 'Method', value: 'Demo password' },
      { label: 'Responders notified', value: '2' },
      { label: 'Note', value: 'Checked' },
      { label: 'Extra', value: '{"a":1}' },
    ]);
    expect(auditDetails(null)).toEqual([]);
  });
});
