import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@sahaya/contracts';
import type { Me } from './api/sahaya';
import { App } from './App';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function person(roles: Role[], name: string): Me {
  return {
    id: '10000000-0000-4000-8000-0000000000aa',
    email: 'someone@example.invalid',
    displayName: name,
    language: 'en',
    roles,
    mode: 'DEMO',
  };
}

const STUDENT = person(['STUDENT'], 'Demo Student');
const RESPONDER = person(['RESPONDER'], 'Demo Responder');
const ADMIN = person(['ADMIN'], 'Demo Admin');

/** Synthetic API: DEMO login for one user, empty lists for everything else. */
function fakeServer(user: Me) {
  return vi.fn<typeof fetch>(async (input) => {
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
    if (url.endsWith('/auth/demo-login'))
      return json({
        accessToken: 'token-abc',
        expiresInSeconds: 7200,
        user,
        warning: 'DEMO authentication only',
      });
    if (url.endsWith('/users/me')) return json(user);
    if (url.includes('/assistant/health'))
      return json({ status: 'ok', provider: 'mock', model: null, modelCheck: 'skipped' });
    if (url.includes('/drills/preflight')) return json({ ok: true, checks: [] });
    return json({ items: [] });
  });
}

async function signIn() {
  const user = userEvent.setup();
  await user.click(
    await screen.findByText('Developer sign-in (DEMO password)', undefined, { timeout: 5000 }),
  );
  await user.type(screen.getByLabelText('Demo account email'), 'demo@example.invalid');
  await user.type(screen.getByLabelText('Demo password'), 'any-password');
  await user.click(screen.getByRole('button', { name: 'Sign in with DEMO password' }));
}

function go(path: string) {
  act(() => {
    window.location.hash = path;
  });
}

const hash = () => window.location.hash.replace(/^#/, '');

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.location.hash = '';
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('route separation', () => {
  it('mounts the student app for a student and keeps staff areas closed', async () => {
    vi.stubGlobal('fetch', fakeServer(STUDENT));
    render(<App apiBaseUrl="http://api.test" />);
    await signIn();
    await screen.findByRole('navigation', { name: 'Main' }, { timeout: 5000 });
    expect(hash()).toBe('/student/home');

    go('/responder/help');
    expect(
      await screen.findByText('Your account cannot open the responder workspace'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull();

    go('/admin/dashboard');
    expect(
      await screen.findByText('Your account cannot open the admin console'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Go to your home screen' }));
    await screen.findByRole('navigation', { name: 'Main' }, { timeout: 5000 });
    expect(hash()).toBe('/student/home');
  });

  it('mounts the responder workspace for a responder, without admin or student areas', async () => {
    vi.stubGlobal('fetch', fakeServer(RESPONDER));
    render(<App apiBaseUrl="http://api.test" />);
    await signIn();
    const sections = await screen.findByRole('navigation', { name: 'Sections' }, { timeout: 5000 });
    expect(hash()).toBe('/responder/overview');
    expect(within(sections).getByRole('button', { name: /Help requests/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Admin console/ })).toBeNull();

    go('/admin/users');
    expect(
      await screen.findByText('Your account cannot open the admin console'),
    ).toBeInTheDocument();
    go('/student/home');
    expect(await screen.findByText('Your account cannot open the student app')).toBeInTheDocument();
  });

  it('mounts the admin console for an admin, with planned sections marked as not built', async () => {
    vi.stubGlobal('fetch', fakeServer(ADMIN));
    render(<App apiBaseUrl="http://api.test" />);
    await signIn();
    const sections = await screen.findByRole('navigation', { name: 'Sections' }, { timeout: 5000 });
    expect(hash()).toBe('/admin/dashboard');
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    const navLabels = within(sections)
      .getAllByRole('button')
      .map((b) => b.textContent);
    // Grouped: Operations, People, Safety data, System.
    expect(navLabels).toEqual([
      'Dashboard',
      'Insights',
      'Analytics',
      'Incident verification',
      'Alert management',
      'Drill management',
      'Users and roles',
      'Audit log',
      'Responder roster',
      'Campus map data',
      'Safe-point approvals',
      'Tom help content',
      'Safety guides',
      'Campus contacts',
      'System settings',
    ]);
    for (const group of ['Operations', 'People', 'Safety data', 'System'])
      expect(within(sections).getByText(group)).toBeInTheDocument();
    // Every specified admin section is now built; an unknown section falls back to the dashboard.
    go('/admin/no-such-section');
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    // Admins may also open the responder workspace.
    await userEvent.click(screen.getByRole('button', { name: /Responder workspace/ }));
    await waitFor(() => expect(hash()).toBe('/responder/overview'));
    expect(
      await screen.findByRole('button', { name: /Admin console/ }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it('returns to the requested page after signing in', async () => {
    vi.stubGlobal('fetch', fakeServer(RESPONDER));
    window.location.hash = '/responder/help';
    render(<App apiBaseUrl="http://api.test" />);
    await waitFor(() => expect(hash()).toBe('/auth/login'));
    await signIn();
    await waitFor(() => expect(hash()).toBe('/responder/help'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Help requests' }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it('never returns a student to a staff page after sign-in', async () => {
    vi.stubGlobal('fetch', fakeServer(STUDENT));
    window.location.hash = '/admin/users';
    render(<App apiBaseUrl="http://api.test" />);
    await waitFor(() => expect(hash()).toBe('/auth/login'));
    await signIn();
    await waitFor(() => expect(hash()).toBe('/student/home'));
  });

  it('redirects legacy paths into the new tree', async () => {
    vi.stubGlobal('fetch', fakeServer(RESPONDER));
    render(<App apiBaseUrl="http://api.test" />);
    await signIn();
    await screen.findByRole('navigation', { name: 'Sections' }, { timeout: 5000 });
    go('/r/dispatches');
    await waitFor(() => expect(hash()).toBe('/responder/dispatches'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Dispatches' }),
    ).toBeInTheDocument();
  });
});

describe('public and auth routes', () => {
  it('shows help and legal pages without signing in', async () => {
    window.location.hash = '/help';
    render(<App apiBaseUrl="http://api.test" />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Help and support' }),
    ).toBeInTheDocument();
    expect(screen.getByText('In an emergency, call 112 first')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).toBeNull();

    go('/legal/privacy');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Privacy notice (draft)' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Not reviewed by the university or legal counsel/)).toBeInTheDocument();
  });

  it('limits the no-API mock preview to the student app', async () => {
    window.location.hash = '/admin/dashboard';
    render(<App apiBaseUrl={null} />);
    expect(
      await screen.findByText(/The offline mock preview includes only the student app/),
    ).toBeInTheDocument();
    go('/');
    await waitFor(() => expect(hash()).toBe('/student/home'));
    expect(
      (await screen.findAllByText(/MOCK PREVIEW/, undefined, { timeout: 5000 })).length,
    ).toBeGreaterThan(0);
  });
});

describe('staff layout on phones', () => {
  it('shows a tab bar with the main sections and puts the rest, and sign out, under More', async () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query.includes('max-width'),
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
    vi.stubGlobal('fetch', fakeServer(RESPONDER));
    render(<App apiBaseUrl="http://api.test" />);
    await signIn();
    const tabs = await screen.findByRole('navigation', { name: 'Sections' }, { timeout: 5000 });
    expect(
      within(tabs)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Overview', 'Incidents', 'Help', 'Map', 'More']);
    // Only one navigation is rendered: no desktop sidebar.
    expect(screen.queryByRole('complementary', { name: 'Responder workspace' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Call 112' })).toHaveAttribute('href', 'tel:112');

    await userEvent.click(within(tabs).getByRole('button', { name: 'More' }));
    const sheet = screen.getByRole('dialog', { name: 'All sections' });
    expect(within(sheet).getByRole('button', { name: /Dispatches/ })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /Sign out$/ })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: /Contacts/ }));
    await waitFor(() => expect(hash()).toBe('/responder/contacts'));
    expect(screen.queryByRole('dialog', { name: 'All sections' })).toBeNull();
    expect(within(tabs).getByRole('button', { name: 'More' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
