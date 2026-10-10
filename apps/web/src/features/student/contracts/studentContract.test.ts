import { submitCheckInSchema } from '@sahaya/contracts';
import { describe, expect, it } from 'vitest';
import {
  composeHelpDetails,
  HELP_DETAILS_MAX,
  NO_DETAILS_TEXT,
  toWireBody,
  upgradeStoredDraft,
  type CheckInDraft,
} from './studentContract';

const session = { kind: 'drill', id: '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f', name: 'Drill', mode: 'DRILL' } as const;
const actionId = '0b6f4a3e-2c1d-4e5f-8a9b-0c1d2e3f4a5b';
const createdAt = '2026-10-10T09:00:00.000Z';

describe('toWireBody', () => {
  it('builds a CONFIRMED_SAFE body that passes the shared zod schema', () => {
    const result = toWireBody({ status: 'CONFIRMED_SAFE', session }, actionId, createdAt);
    expect(result).toEqual({
      ok: true,
      body: { status: 'CONFIRMED_SAFE', drillId: session.id, clientActionId: actionId, clientCreatedAt: createdAt },
    });
  });

  it('uses incidentId for incident sessions', () => {
    const result = toWireBody({ status: 'CONFIRMED_SAFE', session: { ...session, kind: 'incident' } }, actionId, createdAt);
    expect(result.ok && result.body).toMatchObject({ incidentId: session.id });
    expect(result.ok && 'drillId' in result.body).toBe(false);
  });

  it('sends a fixed, client-labelled text when a help request has no details (contract requires helpDetails)', () => {
    const result = toWireBody({ status: 'HELP_REQUESTED', session }, actionId, createdAt);
    expect(result.ok && result.body.helpDetails).toBe(NO_DETAILS_TEXT);
    expect(result.ok && submitCheckInSchema.safeParse(result.body).success).toBe(true);
  });

  it('refuses to build a body without an incident or drill', () => {
    expect(toWireBody({ status: 'CONFIRMED_SAFE', session: null }, actionId, createdAt)).toEqual({ ok: false, reason: 'NO_SESSION' });
  });

  it('reports INVALID when the schema rejects the body', () => {
    expect(toWireBody({ status: 'CONFIRMED_SAFE', session }, 'not-a-uuid', createdAt)).toEqual({ ok: false, reason: 'INVALID' });
  });
});

describe('composeHelpDetails', () => {
  it('appends a student landmark and a labelled device location', () => {
    const text = composeHelpDetails({
      note: 'Twisted ankle',
      landmark: 'Library steps',
      location: { latitude: 10.903711, longitude: 76.899991, accuracyMetres: 24.4, capturedAt: createdAt },
    });
    expect(text).toBe(
      'Twisted ankle\nLocation described by student: Library steps\nDevice location (±24 m, captured 2026-10-10T09:00:00.000Z): 10.90371, 76.89999',
    );
  });

  it('shortens a long note but never cuts off location lines, staying within the contract limit', () => {
    const text = composeHelpDetails({ note: 'x'.repeat(2000), landmark: 'Hostel B' });
    expect(text.length).toBeLessThanOrEqual(HELP_DETAILS_MAX);
    expect(text.endsWith('Location described by student: Hostel B')).toBe(true);
  });
});

describe('upgradeStoredDraft', () => {
  it('reads entries saved by the earlier build (SAFE / NEED_HELP / locationReference)', () => {
    expect(upgradeStoredDraft({ status: 'SAFE' })).toEqual({ status: 'CONFIRMED_SAFE', session: null });
    expect(upgradeStoredDraft({ status: 'NEED_HELP', note: 'help', locationReference: 'geo:1,2;u=5' })).toEqual({
      status: 'HELP_REQUESTED',
      session: null,
      note: 'help (geo:1,2;u=5)',
    });
  });

  it('keeps current drafts unchanged', () => {
    const draft: CheckInDraft = { status: 'HELP_REQUESTED', session, landmark: 'Gate 2', attachmentIds: ['a'] };
    expect(upgradeStoredDraft(draft)).toEqual(draft);
  });
});
