import { describe, expect, it, vi } from 'vitest';
import { HttpStudentApi } from './httpStudentApi';

const storedCheckIn = {
  id: 'ci-1',
  status: 'SAFE',
  createdAt: '2026-10-10T09:00:01Z',
  updatedAt: '2026-10-10T09:00:01Z',
  deliveryState: 'ACCEPTED',
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

describe('HttpStudentApi.createCheckIn', () => {
  it('POSTs the request with the idempotency key header', async () => {
    const { api, fetchImpl } = apiWith(json(storedCheckIn, 201));
    await api.createCheckIn({ status: 'SAFE' }, 'key-123');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/api/v1/check-ins');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Idempotency-Key']).toBe('key-123');
    expect(JSON.parse(init?.body as string)).toEqual({ status: 'SAFE' });
  });

  it('maps 2xx with a stored check-in to accepted', async () => {
    const { api } = apiWith(json(storedCheckIn, 201));
    expect(await api.createCheckIn({ status: 'SAFE' }, 'k')).toEqual({ kind: 'accepted', result: storedCheckIn });
  });

  it('does not treat an unreadable 2xx as accepted', async () => {
    const { api } = apiWith(new Response('<html>', { status: 200 }));
    expect((await api.createCheckIn({ status: 'SAFE' }, 'k')).kind).toBe('retryable');
  });

  it('does not call the network while offline', async () => {
    const { api, fetchImpl } = apiWith(json(storedCheckIn), false);
    expect(await api.createCheckIn({ status: 'SAFE' }, 'k')).toEqual({ kind: 'retryable', problem: 'OFFLINE' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps an aborted (timed-out) request to TIMEOUT', async () => {
    const { api } = apiWith(
      () =>
        new Promise<Response>((_, reject) => {
          setTimeout(() => reject(new DOMException('aborted', 'AbortError')), 60);
        }),
    );
    expect(await api.createCheckIn({ status: 'SAFE' }, 'k')).toMatchObject({ kind: 'retryable', problem: 'TIMEOUT' });
  });

  it('maps a network error while online to SERVER_UNAVAILABLE', async () => {
    const { api } = apiWith(new TypeError('Failed to fetch'));
    expect(await api.createCheckIn({ status: 'SAFE' }, 'k')).toMatchObject({ problem: 'SERVER_UNAVAILABLE' });
  });

  it.each([401, 403])('maps HTTP %i to a PERMISSION_DENIED failure with the error code', async (status) => {
    const { api } = apiWith(json({ error: { code: 'FORBIDDEN', message: 'x', requestId: 'r' } }, status));
    expect(await api.createCheckIn({ status: 'SAFE' }, 'k')).toEqual({
      kind: 'failed',
      problem: 'PERMISSION_DENIED',
      detail: 'FORBIDDEN',
    });
  });

  it.each([
    [408, 'TIMEOUT'],
    [504, 'TIMEOUT'],
    [429, 'SERVER_UNAVAILABLE'],
    [500, 'SERVER_UNAVAILABLE'],
    [503, 'SERVER_UNAVAILABLE'],
  ])('maps HTTP %i to retryable %s', async (status, problem) => {
    const { api } = apiWith(json({}, status));
    expect(await api.createCheckIn({ status: 'SAFE' }, 'k')).toMatchObject({ kind: 'retryable', problem });
  });

  it.each([400, 404, 422])('maps HTTP %i to REJECTED', async (status) => {
    const { api } = apiWith(json({ error: { code: 'VALIDATION_FAILED', message: 'x', requestId: 'r' } }, status));
    expect(await api.createCheckIn({ status: 'SAFE' }, 'k')).toMatchObject({ kind: 'failed', problem: 'REJECTED' });
  });
});

describe('HttpStudentApi.listInstructionPacks', () => {
  it('requests packs for a language and returns items', async () => {
    const { api, fetchImpl } = apiWith(json({ items: [] }));
    expect(await api.listInstructionPacks('ta')).toEqual({ kind: 'ok', packs: [] });
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://api.example.test/api/v1/instruction-packs?language=ta');
  });

  it('reports permission denial', async () => {
    const { api } = apiWith(json({}, 403));
    expect(await api.listInstructionPacks('en')).toEqual({ kind: 'error', problem: 'PERMISSION_DENIED' });
  });
});
