import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, describeProblem } from './api/client';
import type { HelpRequest, Me, SahayaApi } from './api/sahaya';
import { App } from './App';
import { parseAppConfig } from './config';
import { HelpRequestsView } from './responder/views';
import { OwnerScopedQueueStore } from './student/core';
import { sosSteps } from './student/SosScreen';
import { MemoryQueueStore, type QueueEntry } from '../lib/offline';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('parseAppConfig', () => {
  it('accepts an origin, strips /api/v1 and treats a bare host as https', () => {
    expect(parseAppConfig({ VITE_API_BASE_URL: 'http://127.0.0.1:3000/api/v1/' })).toEqual({
      apiBaseUrl: 'http://127.0.0.1:3000',
    });
    expect(parseAppConfig({ VITE_API_BASE_URL: 'sahaya-api.onrender.com' })).toEqual({
      apiBaseUrl: 'https://sahaya-api.onrender.com',
    });
    expect(parseAppConfig({})).toEqual({ apiBaseUrl: null });
  });
});

describe('ApiClient', () => {
  it('sends the bearer token and an idempotency key on mutations', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ ok: true }, 201));
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      getToken: () => 'tok',
      fetchImpl,
      isOnline: () => true,
    });
    await client.post('/api/v1/things', { a: 1 }, 'key-1');
    const headers = fetchImpl.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['Idempotency-Key']).toBe('key-1');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('ends the session on 401 and classifies 403 without claiming success', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({ error: { code: 'UNAUTHORIZED', message: 'x', requestId: 'r' } }, 401),
      )
      .mockResolvedValueOnce(
        json({ error: { code: 'FORBIDDEN', message: 'no', requestId: 'r' } }, 403),
      );
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      getToken: () => 'tok',
      onUnauthorized,
      fetchImpl,
      isOnline: () => true,
    });
    await expect(client.get('/a')).rejects.toMatchObject({ problem: 'UNAUTHENTICATED' });
    expect(onUnauthorized).toHaveBeenCalledOnce();
    const forbidden = await client.get('/b').catch((e: unknown) => e);
    expect(forbidden).toBeInstanceOf(ApiError);
    expect(describeProblem(forbidden)).toMatch(/not permitted/);
  });

  it('never sends while offline', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = new ApiClient({
      baseUrl: 'http://api.test',
      getToken: () => null,
      fetchImpl,
      isOnline: () => false,
    });
    await expect(client.post('/x', {})).rejects.toMatchObject({ problem: 'OFFLINE' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('OwnerScopedQueueStore', () => {
  it('keeps each user’s queued check-ins apart on a shared device', async () => {
    const inner = new MemoryQueueStore<string, string>();
    const alice = new OwnerScopedQueueStore(inner, 'alice');
    const bob = new OwnerScopedQueueStore(inner, 'bob');
    const entry = (key: string): QueueEntry<string, string> => ({
      key,
      payload: key,
      createdAt: '2026-10-11T00:00:00Z',
      lifecycle: 'QUEUED',
      attempts: 0,
      lastAttemptAt: null,
      problem: 'OFFLINE',
      problemDetail: null,
      result: null,
      acceptedAt: null,
    });
    await alice.put(entry('a1'));
    await bob.put(entry('b1'));
    expect((await alice.loadAll()).map((e) => e.key)).toEqual(['a1']);
    expect((await bob.loadAll()).map((e) => e.key)).toEqual(['b1']);
  });
});

describe('sosSteps', () => {
  it('never marks an offline request as received or acknowledged', () => {
    const steps = sosSteps('LOCAL_ONLY', null);
    expect(steps.map((s) => s.state)).toEqual(['done', 'current', 'todo', 'todo', 'todo']);
    expect(steps[1]!.label).toMatch(/not sent/);
  });
  it('shows server receipt, then responder acknowledgement only from server status', () => {
    expect(sosSteps('SERVER_RECEIVED', 'OPEN').map((s) => s.state)).toEqual([
      'done',
      'done',
      'done',
      'current',
      'todo',
    ]);
    expect(sosSteps('SERVER_RECEIVED', 'ASSIGNED').map((s) => s.state)).toEqual([
      'done',
      'done',
      'done',
      'done',
      'done',
    ]);
    expect(sosSteps('FAILED', null)[1]!.state).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
const student: Me = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 's@example.invalid',
  displayName: 'Demo Student',
  language: 'en',
  roles: ['STUDENT'],
  mode: 'DEMO',
};
const responder: Me = {
  ...student,
  id: '10000000-0000-4000-8000-000000000002',
  displayName: 'Demo Responder',
  roles: ['RESPONDER'],
};

function fakeServer(user: Me) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith('/auth/config'))
      return json({
        methods: ['EMAIL_OTP', 'DEMO_PASSWORD'],
        allowedEmailDomains: ['campus.test'],
        emailDelivery: true,
        codeLength: 6,
        codeTtlSeconds: 600,
        resendAfterSeconds: 60,
      });
    if (url.endsWith('/auth/demo-login')) {
      const body = JSON.parse(init!.body as string) as { password: string };
      if (body.password !== 'correct-password')
        return json(
          { error: { code: 'UNAUTHORIZED', message: 'Invalid credentials', requestId: 'r' } },
          401,
        );
      return json({
        accessToken: 'token-abc',
        expiresInSeconds: 7200,
        user,
        warning: 'DEMO authentication only',
      });
    }
    if (url.endsWith('/users/me')) return json(user);
    if (url.includes('/assistant/health'))
      return json({ status: 'ok', provider: 'mock', model: null, modelCheck: 'skipped' });
    return json({ items: [] });
  });
}

async function openDemoSignIn() {
  await userEvent.click(
    await screen.findByText('Developer sign-in (DEMO password)', undefined, { timeout: 5000 }),
  );
}

describe('App shell', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    window.location.hash = '';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('signs a student in with DEMO login and shows the five-tab student app', async () => {
    const fetchImpl = fakeServer(student);
    vi.stubGlobal('fetch', fetchImpl);
    render(<App apiBaseUrl="http://api.test" />);
    await openDemoSignIn();
    await userEvent.type(
      screen.getByLabelText('Demo account email'),
      'student.demo@example.invalid',
    );
    await userEvent.type(screen.getByLabelText('Demo password'), 'correct-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with DEMO password' }));

    const nav = await screen.findByRole('navigation', { name: 'Main' }, { timeout: 5000 });
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Home', 'Map', 'Alerts', 'Prepare', 'Profile']);
    expect(screen.getByRole('button', { name: 'Open emergency SOS screen' })).toBeInTheDocument();
    expect(screen.getAllByText(/Not connected to campus security/).length).toBeGreaterThan(0);
    // Later requests carry the server-issued token.
    await waitFor(() =>
      expect(
        fetchImpl.mock.calls.some(
          ([, init]) =>
            (init?.headers as Record<string, string> | undefined)?.Authorization ===
            'Bearer token-abc',
        ),
      ).toBe(true),
    );
  });

  it('routes staff to the responder workspace and rejects wrong passwords', async () => {
    vi.stubGlobal('fetch', fakeServer(responder));
    render(<App apiBaseUrl="http://api.test" />);
    await openDemoSignIn();
    await userEvent.type(
      screen.getByLabelText('Demo account email'),
      'responder.demo@example.invalid',
    );
    await userEvent.type(screen.getByLabelText('Demo password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with DEMO password' }));
    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Demo password'));
    await userEvent.type(screen.getByLabelText('Demo password'), 'correct-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with DEMO password' }));
    const sections = await screen.findByRole('navigation', { name: 'Sections' }, { timeout: 5000 });
    expect(within(sections).getByRole('button', { name: /Help requests/ })).toBeInTheDocument();
    // Pack review is for verifiers/admins only.
    expect(within(sections).queryByRole('button', { name: /Instruction packs/ })).toBeNull();
  });

  it('offers only the labelled mock preview when no API is configured', async () => {
    render(<App apiBaseUrl={null} />);
    expect(
      (await screen.findAllByText(/MOCK PREVIEW/, undefined, { timeout: 5000 })).length,
    ).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
describe('HelpRequestsView', () => {
  const open: HelpRequest = {
    id: 'h1',
    studentId: 's1',
    incidentId: 'i1',
    drillId: null,
    zoneId: 'z1',
    status: 'OPEN',
    priority: null,
    details: 'Synthetic request',
    assignedResponderId: null,
    acknowledgedAt: null,
    assignedAt: null,
    resolvedAt: null,
    cancelledAt: null,
    createdAt: '2026-10-11T00:00:00Z',
    updatedAt: '2026-10-11T00:00:00Z',
  };

  it('acknowledges through the API with an idempotency key and surfaces server refusals', async () => {
    const transitionHelpRequest = vi
      .fn<SahayaApi['transitionHelpRequest']>()
      .mockRejectedValueOnce(new ApiError('FORBIDDEN', 403, 'FORBIDDEN', 'outside zone'))
      .mockResolvedValueOnce({ ...open, status: 'ACKNOWLEDGED' });
    const api = {
      listHelpRequests: vi.fn(async () => ({ items: [open] })),
      responderInbox: vi.fn(async () => ({ items: [], unseen: 0, note: '' })),
      transitionHelpRequest,
    } as unknown as SahayaApi;
    render(<HelpRequestsView api={api} user={responder} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Acknowledge' }));
    expect(await screen.findByText(/not permitted/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(transitionHelpRequest).toHaveBeenCalledTimes(2));
    const [first, second] = transitionHelpRequest.mock.calls;
    expect(first![1]).toBe('acknowledge');
    // A retry of the same action reuses the same key.
    expect(second![2]).toBe(first![2]);
    // Responders may assign themselves; only admins see Cancel.
    expect(screen.getByRole('button', { name: 'Assign to me' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
});
