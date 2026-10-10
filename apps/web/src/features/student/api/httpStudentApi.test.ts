import { describe, expect, it, vi } from 'vitest';
import type { CheckInDraft } from '../contracts/studentContract';
import { HttpStudentApi } from './httpStudentApi';

const session = { kind: 'drill', id: '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f', name: 'Drill', mode: 'DRILL' } as const;
const key = '0b6f4a3e-2c1d-4e5f-8a9b-0c1d2e3f4a5b';
const createdAt = '2026-10-10T09:00:00.000Z';
const safe: CheckInDraft = { status: 'CONFIRMED_SAFE', session };

const receipt = {
  id: 'c1',
  status: 'CONFIRMED_SAFE',
  deliveryStatus: 'SERVER_RECEIVED',
  serverReceivedAt: '2026-10-10T09:00:01Z',
  clientActionId: key,
  helpRequest: null,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function apiWith(reply: Response | Error | (() => Promise<Response>), online = true) {
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    if (typeof reply === 'function') return reply();
    if (reply instanceof Error) throw reply;
    return reply;
  });
  return { api: new HttpStudentApi('https://api.example.test', fetchImpl, () => online, 50), fetchImpl };
}

describe('HttpStudentApi.submitCheckIn', () => {
  it('POSTs a contract-valid body to /api/v1/checkins with the idempotency key', async () => {
    const { api, fetchImpl } = apiWith(json(receipt, 201));
    await api.submitCheckIn(safe, key, createdAt);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/api/v1/checkins');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Idempotency-Key']).toBe(key);
    expect(JSON.parse(init?.body as string)).toEqual({
      status: 'CONFIRMED_SAFE',
      drillId: session.id,
      clientActionId: key,
      clientCreatedAt: createdAt,
    });
  });

  it('maps a SERVER_RECEIVED receipt to accepted', async () => {
    const { api } = apiWith(json(receipt, 201));
    expect(await api.submitCheckIn(safe, key, createdAt)).toEqual({ kind: 'accepted', result: receipt });
  });

  it('keeps the OPEN help request from the receipt', async () => {
    const help = { ...receipt, status: 'HELP_REQUESTED', helpRequest: { id: 'h1', status: 'OPEN' } };
    const { api } = apiWith(json(help, 201));
    const outcome = await api.submitCheckIn({ status: 'HELP_REQUESTED', session }, key, createdAt);
    expect(outcome.kind === 'accepted' && outcome.result.helpRequest).toEqual({ id: 'h1', status: 'OPEN' });
  });

  it('does not treat an unreadable 2xx as received', async () => {
    const { api } = apiWith(new Response('<html>', { status: 200 }));
    expect((await api.submitCheckIn(safe, key, createdAt)).kind).toBe('retryable');
  });

  it('fails without a network call when no incident or drill is known', async () => {
    const { api, fetchImpl } = apiWith(json(receipt, 201));
    expect(await api.submitCheckIn({ status: 'CONFIRMED_SAFE', session: null }, key, createdAt)).toEqual({
      kind: 'failed',
      problem: 'REJECTED',
      detail: 'NO_SESSION',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not call the network while offline', async () => {
    const { api, fetchImpl } = apiWith(json(receipt), false);
    expect(await api.submitCheckIn(safe, key, createdAt)).toEqual({ kind: 'retryable', problem: 'OFFLINE' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps an aborted (timed-out) request to TIMEOUT', async () => {
    const { api } = apiWith(
      () => new Promise<Response>((_, reject) => setTimeout(() => reject(new DOMException('aborted', 'AbortError')), 60)),
    );
    expect(await api.submitCheckIn(safe, key, createdAt)).toMatchObject({ kind: 'retryable', problem: 'TIMEOUT' });
  });

  it('maps a network error while online to SERVER_UNAVAILABLE', async () => {
    const { api } = apiWith(new TypeError('Failed to fetch'));
    expect(await api.submitCheckIn(safe, key, createdAt)).toMatchObject({ problem: 'SERVER_UNAVAILABLE' });
  });

  it.each([401, 403])('maps HTTP %i to PERMISSION_DENIED with the error code', async (status) => {
    const { api } = apiWith(json({ error: { code: 'FORBIDDEN', message: 'x', requestId: 'r' } }, status));
    expect(await api.submitCheckIn(safe, key, createdAt)).toEqual({ kind: 'failed', problem: 'PERMISSION_DENIED', detail: 'FORBIDDEN' });
  });

  it.each([
    [408, 'TIMEOUT'],
    [504, 'TIMEOUT'],
    [429, 'SERVER_UNAVAILABLE'],
    [500, 'SERVER_UNAVAILABLE'],
  ])('maps HTTP %i to retryable %s', async (status, problem) => {
    const { api } = apiWith(json({}, status));
    expect(await api.submitCheckIn(safe, key, createdAt)).toMatchObject({ kind: 'retryable', problem });
  });

  it.each([400, 404, 409])('maps HTTP %i to REJECTED', async (status) => {
    const { api } = apiWith(json({ error: { code: 'CONFLICT', message: 'x', requestId: 'r' } }, status));
    expect(await api.submitCheckIn(safe, key, createdAt)).toMatchObject({ kind: 'failed', problem: 'REJECTED' });
  });
});

describe('HttpStudentApi.getActiveSession', () => {
  it('returns the first ACTIVE drill', async () => {
    const { api, fetchImpl } = apiWith(
      json({ items: [{ id: 'd0', name: 'Old', mode: 'DRILL', status: 'COMPLETED' }, { id: session.id, name: 'Fire drill', mode: 'DRILL', status: 'ACTIVE' }] }),
    );
    expect(await api.getActiveSession()).toEqual({ kind: 'found', session: { kind: 'drill', id: session.id, name: 'Fire drill', mode: 'DRILL' } });
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://api.example.test/api/v1/drills');
  });

  it('reports none when no drill is active', async () => {
    const { api } = apiWith(json({ items: [] }));
    expect(await api.getActiveSession()).toEqual({ kind: 'none' });
  });
});

describe('HttpStudentApi.listInstructionPacks', () => {
  it('requests packs for a contract language and returns items', async () => {
    const { api, fetchImpl } = apiWith(json({ items: [], nextCursor: null }));
    expect(await api.listInstructionPacks('ta')).toEqual({ kind: 'ok', packs: [] });
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://api.example.test/api/v1/instruction-packs?language=ta');
  });

  it('does not request languages the API does not accept (avoids a 400)', async () => {
    const { api, fetchImpl } = apiWith(json({ items: [] }));
    expect(await api.listInstructionPacks('hi')).toEqual({ kind: 'ok', packs: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports permission denial', async () => {
    const { api } = apiWith(json({}, 403));
    expect(await api.listInstructionPacks('en')).toEqual({ kind: 'error', problem: 'PERMISSION_DENIED' });
  });
});

describe('HttpStudentApi with an app session', () => {
  const incidentId = '11111111-1111-4111-8111-111111111111';
  const ownIncidentId = '22222222-2222-4222-8222-222222222222';
  const drillId = '33333333-3333-4333-8333-333333333333';

  function signedIn(preferred: string | null = null) {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/alerts/inbox')) {
        return json({
          items: [
            { incidentId, incidentVerificationStatus: 'VERIFIED', title: 'Smoke near block', mode: 'DEMO' },
            { incidentId: null, title: 'General notice', mode: 'DEMO' },
          ],
        });
      }
      if (url.includes('/incidents')) {
        return json({
          items: [
            { id: ownIncidentId, type: 'MEDICAL', mode: 'DEMO', verificationStatus: 'REPORTED' },
            { id: 'closed', type: 'OLD', mode: 'DEMO', verificationStatus: 'RESOLVED' },
          ],
        });
      }
      return json({ items: [{ id: drillId, name: 'Drill', mode: 'SIMULATION', status: 'ACTIVE' }] });
    });
    const api = new HttpStudentApi('https://api.example.test', fetchImpl, () => true, 50, {
      getAccessToken: () => 'token-123',
      preferredSessionId: () => preferred,
    });
    return { api, fetchImpl };
  }

  it('sends the bearer token on every request', async () => {
    const { api, fetchImpl } = signedIn();
    await api.submitCheckIn(safe, key, createdAt);
    const headers = fetchImpl.mock.calls[0]![1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token-123');
    expect(headers['Idempotency-Key']).toBe(key);
  });

  it('orders alert-linked incidents, then own open reports, then active drills', async () => {
    const { api } = signedIn();
    const listed = await api.listSessions();
    expect(listed).toEqual({
      kind: 'ok',
      sessions: [
        { kind: 'incident', id: incidentId, name: 'Smoke near block', mode: 'DEMO' },
        { kind: 'incident', id: ownIncidentId, name: 'MEDICAL (reported by you)', mode: 'DEMO' },
        { kind: 'drill', id: drillId, name: 'Drill', mode: 'SIMULATION' },
      ],
    });
    expect(await api.getActiveSession()).toMatchObject({ kind: 'found', session: { id: incidentId } });
  });

  it('honours the session the student picked while it is still available', async () => {
    const { api } = signedIn(drillId);
    expect(await api.getActiveSession()).toMatchObject({ kind: 'found', session: { id: drillId } });
  });
});
