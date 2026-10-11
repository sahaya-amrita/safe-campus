import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser, Role } from '@sahaya/contracts';
import type { Me } from '../api/sahaya';
import { App } from '../App';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const problem = (status: number, code: string, details?: unknown) =>
  json({ error: { code, message: code, requestId: 'r', ...(details ? { details } : {}) } }, status);

const hash = () => window.location.hash.replace(/^#/, '');

interface Options {
  methods?: string[];
  emailDelivery?: boolean;
  user?: Me;
  created?: boolean;
}

/**
 * Synthetic sign-in server: the right code is always 246810. Records every
 * request so tests can check what the client sent.
 */
function otpServer(options: Options = {}) {
  const user: Me = options.user ?? {
    id: '20000000-0000-4000-8000-000000000001',
    email: 'new@campus.test',
    displayName: 'New Student',
    language: 'en',
    roles: ['STUDENT'],
    mode: 'DEMO',
  };
  const calls: { url: string; body: unknown }[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ url, body });
    if (url.endsWith('/auth/config'))
      return json({
        methods: options.methods ?? ['EMAIL_OTP'],
        allowedEmailDomains: ['campus.test'],
        emailDelivery: options.emailDelivery ?? true,
        codeLength: 6,
        codeTtlSeconds: 600,
        resendAfterSeconds: 60,
      });
    if (url.endsWith('/auth/otp/request'))
      return json(
        { status: 'CODE_SENT_IF_ELIGIBLE', codeTtlSeconds: 600, resendAfterSeconds: 60 },
        202,
      );
    if (url.endsWith('/auth/otp/verify')) {
      const { code } = body as { code: string };
      if (code !== '246810') return problem(400, 'OTP_INVALID');
      return json(
        {
          accessToken: 'otp-token',
          expiresInSeconds: 7200,
          user,
          warning: 'Prototype sign-in',
          created: options.created ?? false,
        },
        options.created ? 201 : 200,
      );
    }
    if (url.endsWith('/users/me')) return json(user);
    if (url.includes('/assistant/health'))
      return json({ status: 'ok', provider: 'mock', model: null, modelCheck: 'skipped' });
    return json({ items: [] });
  });
  return { fetchImpl, calls };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.location.hash = '';
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('email code sign-in', () => {
  it('signs in with an emailed code and never says the account exists', async () => {
    const server = otpServer();
    vi.stubGlobal('fetch', server.fetchImpl);
    const user = userEvent.setup();
    render(<App apiBaseUrl="http://api.test" />);

    expect(
      await screen.findByRole('heading', { name: 'Sign in' }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Developer sign-in/)).toBeNull();
    expect(screen.queryByLabelText(/password/i)).toBeNull();

    await user.type(screen.getByLabelText('Email'), ' New@Campus.TEST ');
    await user.click(screen.getByRole('button', { name: 'Email me a code' }));
    await waitFor(() => expect(hash()).toBe('/auth/verify'));
    expect(await screen.findByText(/If/, { selector: 'p' })).toHaveTextContent(
      'If new@campus.test can use Amrita Sahaya, we emailed it a 6-digit code.',
    );
    expect(server.calls.find((c) => c.url.endsWith('/otp/request'))?.body).toEqual({
      email: 'new@campus.test',
    });

    // Wrong code: a clear message, the field is cleared.
    await user.type(screen.getByLabelText('6-digit code'), '111111');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is wrong or has expired');
    expect(screen.getByLabelText('6-digit code')).toHaveValue('');

    // Letters are ignored; the right code signs in.
    await user.type(screen.getByLabelText('6-digit code'), '24a6810');
    expect(screen.getByLabelText('6-digit code')).toHaveValue('246810');
    expect(screen.getByLabelText('6-digit code')).toHaveAttribute('autocomplete', 'one-time-code');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('navigation', { name: 'Main' }, { timeout: 5000 });
    expect(hash()).toBe('/student/home');
    expect(sessionStorage.getItem('sahaya.otp.pending.v1')).toBeNull();
  });

  it('waits before allowing another code and can switch address', async () => {
    vi.stubGlobal('fetch', otpServer().fetchImpl);
    const user = userEvent.setup();
    render(<App apiBaseUrl="http://api.test" />);
    await user.type(
      await screen.findByLabelText('Email', undefined, { timeout: 5000 }),
      'a@campus.test',
    );
    await user.click(screen.getByRole('button', { name: 'Email me a code' }));
    const resend = await screen.findByRole('button', { name: /Send a new code in \d+s/ });
    expect(resend).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Use a different email' }));
    await waitFor(() => expect(hash()).toBe('/auth/login'));
  });

  it('checks the allowed domain before registering and sends the name with the code', async () => {
    const server = otpServer({ created: true });
    vi.stubGlobal('fetch', server.fetchImpl);
    window.location.hash = '/auth/register';
    const user = userEvent.setup();
    render(<App apiBaseUrl="http://api.test" />);

    await user.type(
      await screen.findByLabelText('Your name', undefined, { timeout: 5000 }),
      'Asha',
    );
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      'Use your email ending in @campus.test.',
    );
    await user.type(screen.getByLabelText('Email'), 'asha@gmail.test');
    await user.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'New accounts need an email address ending in @campus.test.',
    );
    expect(server.calls.some((c) => c.url.endsWith('/otp/request'))).toBe(false);

    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'asha@campus.test');
    await user.click(screen.getByRole('button', { name: 'Email me a code' }));
    await user.type(await screen.findByLabelText('6-digit code'), '246810');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(server.calls.find((c) => c.url.endsWith('/otp/verify'))?.body).toEqual({
      email: 'asha@campus.test',
      code: '246810',
      displayName: 'Asha',
    });
    // A new account sees the welcome once, which asks for no permissions.
    const welcome = await screen.findByRole(
      'heading',
      { name: 'Welcome, New Student' },
      { timeout: 5000 },
    );
    expect(welcome).toHaveFocus();
    expect(screen.getByText(/In an emergency, call 112 first/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('navigation', { name: 'Main' });
    expect(localStorage.getItem('sahaya.welcome.v1')).toBeNull();
  });

  it('says so when the server cannot email codes', async () => {
    vi.stubGlobal('fetch', otpServer({ emailDelivery: false }).fetchImpl);
    render(<App apiBaseUrl="http://api.test" />);
    expect(
      await screen.findByText('Email codes are not available yet', undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Email me a code' })).toBeDisabled();
  });

  it('shows DEMO password sign-in only when the server enables it', async () => {
    vi.stubGlobal('fetch', otpServer({ methods: ['EMAIL_OTP', 'DEMO_PASSWORD'] }).fetchImpl);
    render(<App apiBaseUrl="http://api.test" />);
    expect(
      await screen.findByText('Developer sign-in (DEMO password)', undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it('sends a user who opens the code page directly back to sign in', async () => {
    vi.stubGlobal('fetch', otpServer().fetchImpl);
    window.location.hash = '/auth/verify';
    render(<App apiBaseUrl="http://api.test" />);
    await waitFor(() => expect(hash()).toBe('/auth/login'));
  });
});

describe('admin users and roles', () => {
  const admin: Me = {
    id: '30000000-0000-4000-8000-000000000001',
    email: 'admin@campus.test',
    displayName: 'Admin',
    language: 'en',
    roles: ['ADMIN'],
    mode: 'DEMO',
  };
  const student: AdminUser = {
    id: '30000000-0000-4000-8000-000000000002',
    email: 'student@campus.test',
    displayName: 'Student One',
    roles: ['STUDENT'],
    status: 'ACTIVE',
    emailVerifiedAt: '2026-10-01T10:00:00.000Z',
    lastSignInAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
  };

  it('grants a role only with a reason, through the API', async () => {
    let roles: Role[] = ['STUDENT'];
    const sent: unknown[] = [];
    const base = otpServer({ user: admin }).fetchImpl;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/admin/users?') || url.endsWith('/admin/users'))
          return json({ items: [{ ...student, roles }], nextCursor: null });
        if (url.endsWith(`/admin/users/${student.id}/roles`)) {
          const body = JSON.parse(init!.body as string) as { role: Role; reason: string };
          sent.push(body);
          roles = [...roles, body.role];
          return json({ changed: true, roles });
        }
        return base(input, init);
      }),
    );
    sessionStorage.setItem(
      'sahaya.session.v1',
      JSON.stringify({ token: 't', expiresAt: Date.now() + 3600e3, user: admin, warning: '' }),
    );
    window.location.hash = '/admin/users';
    const user = userEvent.setup();
    render(<App apiBaseUrl="http://api.test" />);

    const roleGroup = await screen.findByLabelText('Roles of student@campus.test', undefined, {
      timeout: 5000,
    });
    expect(within(roleGroup).getByRole('button', { name: 'STUDENT' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(roleGroup).getByRole('button', { name: 'RESPONDER' }));
    const dialog = screen.getByRole('dialog', { name: 'Grant RESPONDER to student@campus.test' });
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Give a reason of at least 5');
    expect(sent).toHaveLength(0);

    await user.type(
      within(dialog).getByLabelText('Reason (kept in the audit log)'),
      'Drill responder',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(
      await screen.findByText(/Grant RESPONDER to student@campus.test: done and recorded/),
    ).toBeInTheDocument();
    expect(sent).toEqual([{ role: 'RESPONDER', reason: 'Drill responder' }]);
    await waitFor(() =>
      expect(
        within(screen.getByLabelText('Roles of student@campus.test')).getByRole('button', {
          name: 'RESPONDER',
        }),
      ).toHaveAttribute('aria-pressed', 'true'),
    );
  });
});

describe('sign out everywhere', () => {
  it('asks to confirm, calls the API, and returns to sign-in with a notice', async () => {
    const studentUser: Me = {
      id: '40000000-0000-4000-8000-000000000001',
      email: 's@campus.test',
      displayName: 'S',
      language: 'en',
      roles: ['STUDENT'],
      mode: 'DEMO',
    };
    const server = otpServer({ user: studentUser });
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.endsWith('/users/me/sign-out-everywhere'))
          return new Response(null, { status: 204 });
        return server.fetchImpl(input, init);
      }),
    );
    sessionStorage.setItem(
      'sahaya.session.v1',
      JSON.stringify({
        token: 't',
        expiresAt: Date.now() + 3600e3,
        user: studentUser,
        warning: '',
      }),
    );
    window.location.hash = '/student/profile';
    const user = userEvent.setup();
    render(<App apiBaseUrl="http://api.test" />);
    await user.click(
      await screen.findByRole('button', { name: 'Sign out of all devices' }, { timeout: 5000 }),
    );
    await user.click(screen.getByRole('button', { name: 'Yes, sign out everywhere' }));
    expect(await screen.findByText('You were signed out on every device.')).toBeInTheDocument();
    await waitFor(() => expect(hash()).toBe('/auth/login'));
    expect(sessionStorage.getItem('sahaya.session.v1')).toBeNull();
  });
});
