import { sosRequestSchema, submitCheckInSchema } from '@sahaya/contracts';
import { describe, expect, it } from 'vitest';
import {
  composeHelpDetails,
  HELP_DETAILS_MAX,
  toSosBody,
  toWireBody,
  toWireLocation,
  upgradeStoredDraft,
  type CheckInDraft,
} from './studentContract';

const session = {
  kind: 'drill',
  id: '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
  name: 'Drill',
  mode: 'DRILL',
} as const;
const actionId = '0b6f4a3e-2c1d-4e5f-8a9b-0c1d2e3f4a5b';
const createdAt = '2026-10-10T09:00:00.000Z';

describe('toWireBody', () => {
  it('builds a CONFIRMED_SAFE body that passes the shared zod schema', () => {
    const result = toWireBody({ status: 'CONFIRMED_SAFE', session }, actionId, createdAt);
    expect(result).toEqual({
      ok: true,
      body: {
        status: 'CONFIRMED_SAFE',
        drillId: session.id,
        clientActionId: actionId,
        clientCreatedAt: createdAt,
      },
    });
  });

  it('uses incidentId for incident sessions', () => {
    const result = toWireBody(
      { status: 'CONFIRMED_SAFE', session: { ...session, kind: 'incident' } },
      actionId,
      createdAt,
    );
    expect(result.ok && result.body).toMatchObject({ incidentId: session.id });
    expect(result.ok && 'drillId' in result.body).toBe(false);
  });

  it('sends no helpDetails for a quick help request (the server records that none were given)', () => {
    const result = toWireBody({ status: 'HELP_REQUESTED', session }, actionId, createdAt);
    expect(result.ok && 'helpDetails' in result.body).toBe(false);
    expect(result.ok && submitCheckInSchema.safeParse(result.body).success).toBe(true);
  });

  it('sends the location as structured data, not inside the text', () => {
    const result = toWireBody(
      {
        status: 'HELP_REQUESTED',
        session,
        note: 'Twisted ankle',
        landmark: 'Library steps',
        location: {
          latitude: 10.903711,
          longitude: 76.899991,
          accuracyMetres: 24.44,
          capturedAt: createdAt,
        },
      },
      actionId,
      createdAt,
    );
    expect(result.ok && result.body).toMatchObject({
      helpDetails: 'Twisted ankle',
      location: {
        method: 'GPS',
        latitude: 10.903711,
        longitude: 76.899991,
        accuracyM: 24.4,
        capturedAt: createdAt,
        landmark: 'Library steps',
      },
    });
  });

  it('refuses to build a body without an incident or drill', () => {
    expect(toWireBody({ status: 'CONFIRMED_SAFE', session: null }, actionId, createdAt)).toEqual({
      ok: false,
      reason: 'NO_SESSION',
    });
  });

  it('reports INVALID when the schema rejects the body', () => {
    expect(toWireBody({ status: 'CONFIRMED_SAFE', session }, 'not-a-uuid', createdAt)).toEqual({
      ok: false,
      reason: 'INVALID',
    });
  });
});

describe('composeHelpDetails and toWireLocation', () => {
  it('uses only the student’s own words, within the contract limit', () => {
    expect(composeHelpDetails({ note: '   ' })).toBeUndefined();
    expect(composeHelpDetails({ note: 'ok' })).toBe('Note: ok');
    expect(composeHelpDetails({ note: 'x'.repeat(2000) })!.length).toBe(HELP_DETAILS_MAX);
  });

  it('sends a typed landmark alone as a MANUAL location, and nothing when there is none', () => {
    expect(toWireLocation({ landmark: ' Hostel B ' })).toEqual({
      method: 'MANUAL',
      landmark: 'Hostel B',
    });
    expect(toWireLocation({ landmark: 'x' })).toBeUndefined();
    expect(toWireLocation({})).toBeUndefined();
  });
});

describe('toSosBody', () => {
  it('builds a valid SOS body when no drill or incident is open', () => {
    const result = toSosBody(
      { status: 'HELP_REQUESTED', session: null, landmark: 'Gate 2' },
      actionId,
      createdAt,
    );
    expect(result).toEqual({
      ok: true,
      body: {
        clientActionId: actionId,
        clientCreatedAt: createdAt,
        category: 'OTHER',
        location: { method: 'MANUAL', landmark: 'Gate 2' },
      },
    });
    expect(result.ok && sosRequestSchema.safeParse(result.body).success).toBe(true);
  });
});

describe('upgradeStoredDraft', () => {
  it('reads entries saved by the earlier build (SAFE / NEED_HELP / locationReference)', () => {
    expect(upgradeStoredDraft({ status: 'SAFE' })).toEqual({
      status: 'CONFIRMED_SAFE',
      session: null,
    });
    expect(
      upgradeStoredDraft({ status: 'NEED_HELP', note: 'help', locationReference: 'geo:1,2;u=5' }),
    ).toEqual({
      status: 'HELP_REQUESTED',
      session: null,
      note: 'help (geo:1,2;u=5)',
    });
  });

  it('keeps current drafts unchanged', () => {
    const draft: CheckInDraft = {
      status: 'HELP_REQUESTED',
      session,
      landmark: 'Gate 2',
      attachmentIds: ['a'],
    };
    expect(upgradeStoredDraft(draft)).toEqual(draft);
  });
});
