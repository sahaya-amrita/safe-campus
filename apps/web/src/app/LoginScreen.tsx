import { useState } from 'react';
import type { FormEvent } from 'react';
import { BRAND } from '../brand';
import { describeProblem } from './api/client';
import { useSession } from './auth/session';
import { ModeBanner } from './ui';

/**
 * Fictional accounts created by `pnpm db:seed` (services/api/src/scripts/seed.ts).
 * Shown only in development or when VITE_SHOW_DEMO_ACCOUNTS=true.
 */
const DEMO_ACCOUNTS = [
  { label: 'Student', email: 'student.demo@example.invalid', password: 'DemoStudent!2026' },
  { label: 'Responder', email: 'responder.demo@example.invalid', password: 'DemoResponder!2026' },
  { label: 'Verifier', email: 'verifier.demo@example.invalid', password: 'DemoVerifier!2026' },
  { label: 'Admin', email: 'admin.demo@example.invalid', password: 'DemoAdmin!2026' },
] as const;

const env = import.meta.env as { DEV?: boolean; VITE_SHOW_DEMO_ACCOUNTS?: string };
const showDemoAccounts = Boolean(env.DEV) || env.VITE_SHOW_DEMO_ACCOUNTS === 'true';

export function LoginScreen({ notice }: { notice?: string | undefined }) {
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
        reason instanceof Error &&
          'problem' in reason &&
          (reason as { status?: number }).status === 401
          ? 'Email or password is incorrect.'
          : describeProblem(reason),
      );
    } finally {
      setBusy(false);
    }
  };

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
        <ModeBanner mode="DEMO" compact />
        <p className="as-muted">
          DEMO sign-in for testing only — not institutional single sign-on. In an emergency, call{' '}
          <a href="tel:112">112</a>.
        </p>
        {notice && (
          <p className="as-notice as-notice--warn" role="status">
            {notice}
          </p>
        )}
        <form className="as-form" onSubmit={(e) => void submit(e)}>
          <label className="as-field">
            Email
            <input
              className="as-input"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="as-field">
            Password
            <input
              className="as-input"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="as-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="as-btn as-btn--block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {showDemoAccounts && (
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
        )}
      </div>
    </main>
  );
}
