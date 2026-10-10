// TEMPORARY dev-only harness panel: signs in to the SAFE CAMPUS API with a
// seeded DEMO account so Tom can call the assistant endpoint, and shows the
// assistant's real status. The access token is kept in memory only (lost on
// reload). The real shell replaces this with institutional sign-in.
import { useCallback, useEffect, useId, useState } from "react";

export interface AssistantSession {
  accessToken: string;
  email: string;
  roles: string[];
  expiresAt: number;
}

interface Health {
  status: "ready" | "degraded" | "disabled";
  provider: string;
  model: string | null;
  modelCheck: string;
}

type HealthState = { kind: "loading" } | { kind: "ok"; health: Health } | { kind: "unreachable" };

export function AssistantConnection({
  apiBaseUrl,
  session,
  onSession,
}: {
  apiBaseUrl: string;
  session: AssistantSession | null;
  onSession: (s: AssistantSession | null) => void;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });

  const checkHealth = useCallback(async () => {
    if (!apiBaseUrl) return setHealth({ kind: "unreachable" });
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/assistant/health`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      setHealth({ kind: "ok", health: (await res.json()) as Health });
    } catch {
      setHealth({ kind: "unreachable" });
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/auth/demo-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json().catch(() => null)) as {
        accessToken?: string;
        expiresInSeconds?: number;
        user?: { email?: string; roles?: string[] };
        error?: { message?: string };
      } | null;
      if (!res.ok || !body?.accessToken) {
        setError(res.status === 401 ? "Those demo credentials were not accepted." : `Sign-in failed (${res.status}).`);
        return;
      }
      onSession({
        accessToken: body.accessToken,
        email: body.user?.email ?? email,
        roles: body.user?.roles ?? [],
        expiresAt: Date.now() + (body.expiresInSeconds ?? 0) * 1000,
      });
      setPassword("");
      setOpen(false);
    } catch {
      setError("Couldn't reach the API.");
    } finally {
      setBusy(false);
    }
  }

  const statusText =
    health.kind === "loading"
      ? "Checking AI assistant…"
      : health.kind === "unreachable"
        ? "AI assistant: API unreachable"
        : health.health.status === "disabled"
          ? "AI assistant: switched off on the server"
          : `AI assistant: ${health.health.provider}${health.health.model ? ` · ${health.health.model}` : ""} (${health.health.status === "ready" ? (health.health.modelCheck === "ok" ? "model verified" : "starting") : `degraded: ${health.health.modelCheck}`})`;

  return (
    <div className="hx-conn" data-state={session ? "signed-in" : "signed-out"}>
      <button type="button" className="hx-conn__chip" aria-expanded={open} aria-controls={`${uid}-panel`} onClick={() => setOpen((o) => !o)}>
        <span className={`hx-conn__dot hx-conn__dot--${health.kind === "ok" && health.health.status === "ready" ? "ok" : "off"}`} aria-hidden="true" />
        {session ? `Tom AI: signed in as ${session.email}` : "Tom AI: not signed in"}
      </button>
      {open && (
        <div id={`${uid}-panel`} className="hx-conn__panel" role="region" aria-label="AI assistant connection">
          <p className="hx-conn__status" role="status">
            {statusText}
          </p>
          <p className="hx-conn__api">API: {apiBaseUrl || "not configured (set VITE_API_BASE_URL)"}</p>
          {session ? (
            <>
              <p>
                Signed in as <strong>{session.email}</strong> ({session.roles.join(", ") || "no roles"}). DEMO
                authentication only; not institutional sign-in.
              </p>
              <button type="button" onClick={() => onSession(null)}>
                Sign out
              </button>
            </>
          ) : (
            <form onSubmit={signIn} className="hx-conn__form">
              <p>
                Sign in with a seeded <strong>DEMO</strong> account (see the harness README) so Tom can use the AI
                assistant. Without signing in, Tom uses built-in help only.
              </p>
              <label htmlFor={`${uid}-email`}>Demo email</label>
              <input id={`${uid}-email`} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <label htmlFor={`${uid}-pw`}>Demo password</label>
              <input id={`${uid}-pw`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="submit" disabled={busy || !apiBaseUrl}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
              {error && <p role="alert">{error}</p>}
            </form>
          )}
          <button type="button" className="hx-conn__link" onClick={() => void checkHealth()}>
            Recheck status
          </button>
        </div>
      )}
    </div>
  );
}
