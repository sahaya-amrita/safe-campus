import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { OTP_CODE_LENGTH, type AuthConfigResponse } from '@sahaya/contracts';
import { BRAND } from '../../brand';
import { Button, ErrorState, FormError, StatusBanner, TextField } from '../../design-system';
import { ApiError, describeProblem } from '../api/client';
import { redirect } from '../router';
import { ROUTES } from '../routes';
import { Loading, ModeBanner } from '../ui';
import { useSession } from './session';

/**
 * Sign-in and registration with an emailed one-time code.
 *
 *   /auth/login     email → code
 *   /auth/register  name + email → code (allow-listed domains only)
 *   /auth/verify    enter the code
 *
 * The server answers a code request the same way whether or not the address
 * can be used, so this screen never says an account exists.
 */

const PENDING_KEY = 'sahaya.otp.pending.v1';

interface Pending {
  email: string;
  displayName?: string;
  mode: 'login' | 'register';
  sentAt: number;
  resendAfterSeconds: number;
  codeTtlSeconds: number;
}

function readPending(): Pending | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}

function writePending(value: Pending | null): void {
  try {
    if (value) sessionStorage.setItem(PENDING_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage blocked: the code step still works until the page reloads.
  }
}

function domainOf(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase();
}

/** Plain-language messages for the sign-in error codes. */
export function describeAuthError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'OTP_INVALID':
        return 'That code is wrong or has expired. Check it, or ask for a new code.';
      case 'OTP_RESEND_TOO_SOON': {
        const wait = (error.details as { retryAfterSeconds?: number } | undefined)
          ?.retryAfterSeconds;
        return `Wait${wait ? ` ${wait} seconds` : ' a moment'} before asking for another code.`;
      }
      case 'OTP_RATE_LIMITED':
      case 'RATE_LIMITED':
        return 'Too many attempts. Wait a while, then try again.';
      case 'ACCOUNT_DISABLED':
        return 'This account is disabled. Contact an administrator.';
      case 'EMAIL_DELIVERY_UNAVAILABLE':
        return 'This server cannot email sign-in codes yet.';
      case 'EMAIL_SEND_FAILED':
        return 'The code email could not be sent. Try again.';
      case 'VALIDATION_ERROR':
        return 'Check the details you entered.';
      default:
        break;
    }
  }
  return describeProblem(error);
}

function AuthCard({ children }: { children: ReactNode }) {
  return (
    <main className="as-login">
      <div className="as-login__card">
        <div className="as-brand">
          <img src={BRAND.emblemUrl} alt="" width={44} height={51} />
          <div>
            <p className="as-brand__name">{BRAND.name}</p>
            <p className="as-brand__tag">{BRAND.tagline}</p>
          </div>
        </div>
        {children}
        <nav className="as-login__links" aria-label="Information pages">
          <a href={`#${ROUTES.help}`}>Help</a>
          <a href={`#${ROUTES.legal.privacy}`}>Privacy</a>
          <a href={`#${ROUTES.legal.prototype}`}>About this prototype</a>
        </nav>
      </div>
    </main>
  );
}

function useAuthConfig() {
  const { auth } = useSession();
  const [state, setState] = useState<{
    config: AuthConfigResponse | null;
    error: unknown;
    loading: boolean;
  }>({ config: null, error: null, loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!auth) return;
    let active = true;
    setState((s) => ({ ...s, loading: true }));
    auth.config().then(
      (config) => active && setState({ config, error: null, loading: false }),
      (error: unknown) => active && setState({ config: null, error, loading: false }),
    );
    return () => {
      active = false;
    };
  }, [auth, attempt]);
  return { ...state, retry: () => setAttempt((a) => a + 1) };
}

export function AuthScreen({ path, notice }: { path: string; notice?: string | undefined }) {
  const { config, error, loading, retry } = useAuthConfig();
  if (loading)
    return (
      <AuthCard>
        <Loading label="Loading sign-in…" />
      </AuthCard>
    );
  if (!config)
    return (
      <AuthCard>
        <ErrorState
          title="Sign-in is unavailable"
          message={describeProblem(error)}
          onRetry={retry}
        />
        <p className="as-muted">
          In an emergency, call <a href="tel:112">112</a>.
        </p>
      </AuthCard>
    );
  if (path === ROUTES.auth.verify) return <CodeStep config={config} />;
  return (
    <EmailStep
      config={config}
      mode={path === ROUTES.auth.register ? 'register' : 'login'}
      notice={notice}
    />
  );
}

function EmailStep({
  config,
  mode,
  notice,
}: {
  config: AuthConfigResponse;
  mode: 'login' | 'register';
  notice?: string | undefined;
}) {
  const { auth } = useSession();
  const [email, setEmail] = useState(() => readPending()?.email ?? '');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const domains = config.allowedEmailDomains;
  const domainList = domains.map((d) => `@${d}`).join(', ');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const value = email.trim().toLowerCase();
    if (mode === 'register' && domains.length > 0 && !domains.includes(domainOf(value))) {
      setError(`New accounts need an email address ending in ${domainList}.`);
      return;
    }
    if (mode === 'register' && name.trim().length < 2) {
      setError('Enter your name (at least 2 characters).');
      return;
    }
    setBusy(true);
    try {
      const sent = await auth!.requestCode(value);
      writePending({
        email: value,
        ...(mode === 'register' ? { displayName: name.trim() } : {}),
        mode,
        sentAt: Date.now(),
        resendAfterSeconds: sent.resendAfterSeconds,
        codeTtlSeconds: sent.codeTtlSeconds,
      });
      redirect(ROUTES.auth.verify);
    } catch (reason) {
      setError(describeAuthError(reason));
    } finally {
      setBusy(false);
    }
  };

  const demo = config.methods.includes('DEMO_PASSWORD') && mode === 'login';

  return (
    <AuthCard>
      <ModeBanner mode="DEMO" compact />
      {notice && <StatusBanner tone="warn">{notice}</StatusBanner>}
      {demo && <DemoQuickStart />}
      <h1 className={demo ? 'as-auth__subtitle' : 'as-auth__title'}>
        {mode === 'register'
          ? 'Create your account'
          : demo
            ? 'Or sign in with your email'
            : 'Sign in'}
      </h1>
      <p className="as-muted">
        {mode === 'register'
          ? 'We email you a 6-digit code. No password needed.'
          : 'We email you a 6-digit code. No password needed.'}{' '}
        In an emergency, call{' '}
        <a className="as-link-strong" href="tel:112">
          112
        </a>{' '}
        first.
      </p>
      {!config.emailDelivery &&
        (demo ? (
          <p className="as-small as-note" role="note">
            <strong>Email codes are not available yet</strong> on this prototype. Use a DEMO account
            above.
          </p>
        ) : (
          <StatusBanner tone="warn" title="Email codes are not available yet">
            This server has no email sender configured, so codes cannot be sent.
          </StatusBanner>
        ))}
      <form className="as-form" onSubmit={(e) => void submit(e)} noValidate>
        {mode === 'register' && (
          <TextField
            label="Your name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
        )}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          {...(mode === 'register' && domains.length > 0
            ? { hint: `Use your email ending in ${domainList}.` }
            : {})}
        />
        <FormError>{error}</FormError>
        <Button
          type="submit"
          block
          loading={busy}
          loadingLabel="Sending code…"
          disabled={!config.emailDelivery || email.trim() === ''}
        >
          Email me a code
        </Button>
      </form>
      <p className="as-small as-muted">
        {mode === 'register' ? (
          <>
            Already have an account? <a href={`#${ROUTES.auth.login}`}>Sign in</a>
          </>
        ) : domains.length > 0 ? (
          <>
            New here? <a href={`#${ROUTES.auth.register}`}>Create an account</a> with your{' '}
            {domainList} email.
          </>
        ) : (
          'New accounts are created by an administrator.'
        )}
      </p>
      {config.methods.includes('DEMO_PASSWORD') && <DemoPasswordSignIn />}
    </AuthCard>
  );
}

function CodeStep({ config }: { config: AuthConfigResponse }) {
  const { auth, completeSignIn } = useSession();
  const [pending, setPending] = useState<Pending | null>(() => readPending());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!pending) redirect(ROUTES.auth.login);
  }, [pending]);
  if (!pending) return null;

  const waitSeconds = Math.max(
    0,
    Math.ceil((pending.sentAt + pending.resendAfterSeconds * 1000 - now) / 1000),
  );

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    if (!new RegExp(`^\\d{${config.codeLength}}$`).test(code)) {
      setError(`Enter the ${config.codeLength}-digit code from the email.`);
      return;
    }
    setBusy(true);
    try {
      const result = await auth!.verifyCode({
        email: pending.email,
        code,
        ...(pending.displayName ? { displayName: pending.displayName } : {}),
      });
      writePending(null);
      completeSignIn(result);
    } catch (reason) {
      setError(describeAuthError(reason));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setInfo(null);
    try {
      const sent = await auth!.requestCode(pending.email);
      const next = {
        ...pending,
        sentAt: Date.now(),
        resendAfterSeconds: sent.resendAfterSeconds,
        codeTtlSeconds: sent.codeTtlSeconds,
      };
      writePending(next);
      setPending(next);
      setCode('');
      setInfo('A new code is on its way. Earlier codes no longer work.');
    } catch (reason) {
      setError(describeAuthError(reason));
    }
  };

  return (
    <AuthCard>
      <h1 className="as-auth__title">Enter your code</h1>
      <p>
        If <strong>{pending.email}</strong> can use {BRAND.name}, we emailed it a{' '}
        {config.codeLength}-digit code. It expires in {Math.round(pending.codeTtlSeconds / 60)}{' '}
        minutes.
      </p>
      <form className="as-form" onSubmit={(e) => void verify(e)} noValidate>
        <TextField
          label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={OTP_CODE_LENGTH}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH))}
          className="as-code-field"
        />
        <FormError>{error}</FormError>
        {info && <StatusBanner tone="info">{info}</StatusBanner>}
        <Button type="submit" block loading={busy} loadingLabel="Checking…">
          {pending.mode === 'register' ? 'Create account' : 'Sign in'}
        </Button>
      </form>
      <div className="as-row as-row--between">
        <Button variant="ghost" size="sm" disabled={waitSeconds > 0} onClick={() => void resend()}>
          {waitSeconds > 0 ? `Send a new code in ${waitSeconds}s` : 'Send a new code'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            writePending(null);
            redirect(pending.mode === 'register' ? ROUTES.auth.register : ROUTES.auth.login);
          }}
        >
          Use a different email
        </Button>
      </div>
      <p className="as-small as-muted">
        No email? Check spam, and make sure the address is right. New accounts are possible only for
        allowed email domains.
      </p>
    </AuthCard>
  );
}

/**
 * Fictional accounts created by `pnpm db:seed`. Shown only when the server
 * enables DEMO password login (local development, or a hosted prototype in
 * DEMO mode).
 */
const DEMO_ACCOUNTS = [
  {
    label: 'Student',
    email: 'student.demo@example.invalid',
    password: 'DemoStudent!2026',
    does: 'Check in, ask for help, learn what to do',
  },
  {
    label: 'Responder',
    email: 'responder.demo@example.invalid',
    password: 'DemoResponder!2026',
    does: 'See and acknowledge help requests',
  },
  {
    label: 'Verifier',
    email: 'verifier.demo@example.invalid',
    password: 'DemoVerifier!2026',
    does: 'Review reported incidents',
  },
  {
    label: 'Admin',
    email: 'admin.demo@example.invalid',
    password: 'DemoAdmin!2026',
    does: 'Run drills, approve data, manage people',
  },
] as const;

/** One-tap sign-in as a fictional DEMO person, for trying the prototype. */
function DemoQuickStart() {
  const { signIn } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const go = async (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setBusy(account.label);
    setError(null);
    try {
      await signIn(account.email, account.password);
    } catch (reason) {
      setError(describeProblem(reason));
      setBusy(null);
    }
  };
  return (
    <section className="as-quickstart" aria-labelledby="as-quickstart-title">
      <h1 id="as-quickstart-title" className="as-auth__title">
        Try the prototype
      </h1>
      <p className="as-muted">
        Choose who you want to be. Every person and record here is fictional.
      </p>
      <div className="as-quickstart__grid">
        {DEMO_ACCOUNTS.map((a) => (
          <button
            key={a.label}
            type="button"
            className="as-rolecard"
            data-role={a.label.toLowerCase()}
            disabled={busy !== null}
            aria-busy={busy === a.label}
            aria-label={`Continue as ${a.label}: ${a.does}`}
            onClick={() => void go(a)}
          >
            <span className="as-rolecard__name">{busy === a.label ? 'Signing in…' : a.label}</span>
            <span className="as-rolecard__does">{a.does}</span>
          </button>
        ))}
      </div>
      <FormError>{error}</FormError>
    </section>
  );
}

function DemoPasswordSignIn() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (reason) {
      setError(
        reason instanceof ApiError && reason.status === 401
          ? 'Email or password is incorrect.'
          : describeProblem(reason),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="as-details as-demo-signin">
      <summary>Developer sign-in (DEMO password)</summary>
      <p className="as-small as-muted">
        Fictional DEMO accounts. Available only while this server runs in DEMO mode.
      </p>
      <form className="as-form" onSubmit={(e) => void submit(e)}>
        <TextField
          label="Demo account email"
          type="email"
          autoComplete="off"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Demo password"
          type="password"
          autoComplete="off"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FormError>{error}</FormError>
        <Button type="submit" variant="secondary" block loading={busy} loadingLabel="Signing in…">
          Sign in with DEMO password
        </Button>
      </form>
      <div className="as-demo-users">
        <p className="as-muted as-small">Fictional DEMO accounts from the database seed:</p>
        <div className="as-row">
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.email}
              type="button"
              className="as-btn as-btn--light as-btn--sm"
              onClick={() => {
                setEmail(a.email);
                setPassword(a.password);
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}
