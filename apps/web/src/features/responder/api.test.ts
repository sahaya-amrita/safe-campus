import { describe, expect, it, vi } from 'vitest';
import { HttpResponderApi } from './api';
import { ApiRequestError, classifyError } from './apiError';
import { MockResponderApi } from './mockApi';

/** Fails the test if a promise that should reject resolves instead. */
const unexpected = (): never => {
  throw new Error('expected the promise to reject');
};

const okJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('HttpResponderApi', () => {
  it('lists with status/cursor/limit and validates the page', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okJson({
        items: [
          {
            id: 'a',
            status: 'OPEN',
            createdAt: '2026-10-10T10:00:00Z',
            lastUpdatedAt: '2026-10-10T10:00:00Z',
          },
        ],
        nextCursor: 'a',
      }),
    );
    const api = new HttpResponderApi({ baseUrl: 'https://api.example.test/', fetchImpl });
    const page = await api.listHelpRequests({ status: 'OPEN', cursor: 'c1' });
    expect(page.items[0]?.priority).toBeNull();
    expect(page.nextCursor).toBe('a');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      'https://api.example.test/api/v1/responder/help-requests?status=OPEN&cursor=c1&limit=25',
    );
    expect(init.credentials).toBe('include');
  });

  it('sends Idempotency-Key on acknowledge', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okJson({
        id: 'a b',
        status: 'ACKNOWLEDGED',
        createdAt: '2026-10-10T10:00:00Z',
        lastUpdatedAt: '2026-10-10T10:01:00Z',
        acknowledgedAt: '2026-10-10T10:01:00Z',
      }),
    );
    const api = new HttpResponderApi({ fetchImpl });
    await api.acknowledgeHelpRequest('a b', 'key-1');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('/api/v1/responder/help-requests/a%20b/acknowledge');
    expect(init.method).toBe('POST');
    expect(init.headers['Idempotency-Key']).toBe('key-1');
  });

  it('maps the shared error shape to ApiRequestError', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        okJson({ error: { code: 'FORBIDDEN', message: 'nope', requestId: 'r1' } }, 403),
      );
    const err = await new HttpResponderApi({ fetchImpl })
      .listHazardReports({})
      .then(unexpected, (e: unknown) => e as ApiRequestError);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.requestId).toBe('r1');
    expect(classifyError(err)).toBe('FORBIDDEN');
  });

  it('reports network failure without inventing a response', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('offline'));
    const err = await new HttpResponderApi({ fetchImpl })
      .listHelpRequests({})
      .then(unexpected, (e: unknown) => e as ApiRequestError);
    expect(classifyError(err)).toBe('NETWORK');
  });

  it('rejects malformed server records', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ items: [{ id: 'a', status: 'MAYBE' }] }));
    const err = await new HttpResponderApi({ fetchImpl })
      .listHelpRequests({})
      .then(unexpected, (e: unknown) => e as ApiRequestError);
    expect(err.code).toBe('INVALID_RESPONSE');
  });

  it('reports roll call as unavailable (no agreed endpoint)', async () => {
    const err = await new HttpResponderApi({ fetchImpl: vi.fn() })
      .getRollCallSummary()
      .then(unexpected, (e: unknown) => e as ApiRequestError);
    expect(classifyError(err)).toBe('UNAVAILABLE');
  });
});

describe('MockResponderApi (simulated server rules)', () => {
  it('rejects non-responder roles and anonymous callers', async () => {
    const student = new MockResponderApi({ session: { role: 'STUDENT', actorId: 'demo-student' } });
    expect(
      classifyError(
        await student.listHelpRequests({}).then(unexpected, (e: unknown) => e as ApiRequestError),
      ),
    ).toBe('FORBIDDEN');
    const anon = new MockResponderApi({ session: { role: null, actorId: 'x' } });
    expect(
      classifyError(
        await anon.listHelpRequests({}).then(unexpected, (e: unknown) => e as ApiRequestError),
      ),
    ).toBe('UNAUTHENTICATED');
  });

  it('attributes acknowledgement to the session actor and audits it', async () => {
    const api = new MockResponderApi({
      session: { role: 'RESPONDER', actorId: 'demo-responder-9' },
    });
    const updated = await api.acknowledgeHelpRequest('DEMO-HR-001', 'k1');
    expect(updated.status).toBe('ACKNOWLEDGED');
    expect(updated.acknowledgedBy).toBe('demo-responder-9');
    expect(api.auditLog).toHaveLength(1);
  });

  it('is idempotent for a repeated key and rejects invalid transitions', async () => {
    const api = new MockResponderApi();
    const a = await api.acknowledgeHelpRequest('DEMO-HR-001', 'same');
    const b = await api.acknowledgeHelpRequest('DEMO-HR-001', 'same');
    expect(b).toEqual(a);
    expect(api.auditLog).toHaveLength(1);
    const err = await api
      .acknowledgeHelpRequest('DEMO-HR-001', 'other')
      .then(unexpected, (e: unknown) => e as ApiRequestError);
    expect(classifyError(err)).toBe('CONFLICT');
  });

  it('paginates instead of returning everything', async () => {
    const api = new MockResponderApi();
    const p1 = await api.listHelpRequests({ limit: 2 });
    expect(p1.items).toHaveLength(2);
    const p2 = await api.listHelpRequests({ limit: 2, cursor: p1.nextCursor });
    expect(p2.items[0]?.id).not.toBe(p1.items[0]?.id);
  });

  it('requires a valid duplicate target in reviews', async () => {
    const api = new MockResponderApi();
    const err = await api
      .reviewHazardReport('DEMO-HZ-002', { decision: 'DUPLICATE', duplicateOfId: 'NOPE' }, 'k')
      .then(unexpected, (e: unknown) => e as ApiRequestError);
    expect(err.status).toBe(422);
    const ok = await api.reviewHazardReport(
      'DEMO-HZ-002',
      { decision: 'DUPLICATE', duplicateOfId: 'DEMO-HZ-001' },
      'k2',
    );
    expect(ok.status).toBe('DUPLICATE');
    expect(ok.reviewedBy).toBe('demo-responder-1');
  });
});
