# Amrita Sahaya — campus safety preparedness and response coordination

One integrated DEMO system: a mobile-first **student PWA**, a **responder workspace**, the **Tom** safety guide, a **3D campus digital twin** with drills, and a PostgreSQL-backed **Express/TypeScript API**.

> **This is demonstration software.** It never contacts emergency services, sirens, sensors or real people. Every incident, alert, dispatch, responder and route is **simulated** unless backed by approved institutional data — and none is configured. It does not replace alarms, trained staff, official procedures or **112**.

## Architecture

```
apps/web  (React 19 + Vite PWA, hash router, one role-aware app)
 ├─ Student app   Home · Map · Alerts · Prepare · Profile  + global SOS + Tom
 ├─ Responder     Overview · Incidents · Help requests · Dispatches · Alerts · Packs · Map · Contacts
 └─ Digital twin  features/maps (Three.js, lazy-loaded) · features/drills
        │  Bearer JWT (DEMO login)                 @sahaya/contracts (shared Zod schemas)
        ▼
services/api  (Express, Zod, RBAC, idempotency, audit, simulated outbox, Tom assistant)
        ▼
PostgreSQL 18
```

The UI chooses a workspace from server-issued roles; the API authorises every call. Students' offline check-ins stay in a per-user IndexedDB queue and are only shown as received after the server confirms (`SERVER_RECEIVED`).

## Run locally on Windows (PowerShell)

Prerequisites: Node.js 22+ (24 tested), pnpm 11 (`pnpm.cmd`), PostgreSQL 18 (native service on 5432, see `docs/WINDOWS_POSTGRES_SETUP.md`, or `docker compose up -d postgres` on host port 55432).

```powershell
pnpm.cmd install
Copy-Item services/api/.env.example services/api/.env      # then set DATABASE_URL and JWT_SECRET (32+ chars)
Copy-Item apps/web/.env.example apps/web/.env.local         # VITE_API_BASE_URL=http://127.0.0.1:3000
pnpm.cmd db:migrate
pnpm.cmd db:seed                                            # fictional DEMO accounts, building, drill, draft pack
pnpm.cmd dev                                                # API on http://127.0.0.1:3000 (+ simulated outbox every 5 s)
```

In a second terminal:

```powershell
pnpm.cmd dev:web                                            # web app on http://localhost:5173
```

DEMO accounts (fictional, created by the seed; quick-fill buttons appear on the login screen in development):

| Role                    | Email                            | Password             |
| ----------------------- | -------------------------------- | -------------------- |
| Student                 | `student.demo@example.invalid`   | `DemoStudent!2026`   |
| Responder (zone DEMO-A) | `responder.demo@example.invalid` | `DemoResponder!2026` |
| Incident verifier       | `verifier.demo@example.invalid`  | `DemoVerifier!2026`  |
| Admin + drill manager   | `admin.demo@example.invalid`     | `DemoAdmin!2026`     |

Without `VITE_API_BASE_URL` the web app opens only a clearly labelled **MOCK preview** that sends nothing.

### Environment

| Variable                            | Where | Purpose                                                                                       |
| ----------------------------------- | ----- | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`, `TEST_DATABASE_URL` | API   | PostgreSQL connection (use the test DB for repeatable writes)                                 |
| `JWT_SECRET`                        | API   | ≥ 32 characters; never commit                                                                 |
| `OPERATING_MODE`                    | API   | `DEMO` (default), `DRILL`, `TEST`, `SIMULATION` — there is no live mode                       |
| `OUTBOX_POLL_MS`                    | API   | Simulated dispatch/alert worker interval, default 5000; `0` disables (use `pnpm outbox:once`) |
| `ASSISTANT_PROVIDER`                | API   | `disabled` / `mock` / `groq` (`GROQ_API_KEY`, `GROQ_MODEL` server-side only)                  |
| `ASSISTANT_ALLOW_DRAFT_CONTENT`     | API   | Keep `false`: Tom then uses only reviewed/published content                                   |
| `VITE_API_BASE_URL`                 | web   | API origin; `/api/v1` is added by the client                                                  |
| `VITE_SHOW_DEMO_ACCOUNTS`           | web   | Show DEMO quick-fill buttons outside development                                              |

## Quality checks

```powershell
pnpm.cmd typecheck      # contracts, API, web
pnpm.cmd lint
pnpm.cmd test           # API (pg-mem) + web Vitest + maps/drills node:test
pnpm.cmd openapi
pnpm.cmd build          # contracts, API, web (PWA)
$env:API_URL="http://127.0.0.1:3000"; node scripts/e2e-acceptance.mjs   # live 14-step scenario against a seeded DEMO API
```

Run the acceptance script only against a dedicated test database: it adds DEMO incidents, alerts and help requests.

## 3–5 minute demonstration

1. **Student** (phone width): sign in → Home shows alert summary, check-in context, _I'm safe / Need help_, helpers, contacts. Note the persistent DEMO banner.
2. **Report incident** → High/Critical priority → "Received by server · not verified" and a _simulated_ dispatch.
3. **Verifier** (new tab/window): Incidents → open the report → record _Verified_ with a reason (audited). Students cannot do this.
4. **Responder**: Overview → _Start a simulated incident_ shows staff-initiated incidents that need no student report. Dispatches → _Accept (simulated)_ once the outbox has notified it.
5. **Admin**: incident → _Alert affected zone_ → Alerts → _Authorise for simulated delivery_.
6. **Student**: Alerts shows the alert with _Verified by reviewer_; acknowledge it. Open **SOS** (dark screen) → hold 1.5 s (or _Send without holding_ → confirm). Status steps move from _Saved on this device_ → _Received by server_; acknowledgement is shown only after the server records it.
7. **Responder**: Help requests → _Acknowledge_ → _Assign to me_ → _Resolve_. The student's SOS/Profile status updates from the server.
8. **Map**: building/floor/zone explorer (geometry _not approved_, routing disabled) → _Open 3D view_ → the incident is drawn on an illustrative footprint.
9. **Prepare / Packs**: verifier approves and admin publishes the seeded _DEMO preparedness basics_ pack; students see it (cached offline). Ask **Tom** "Where are the preparedness basics instructions?" — it cites the published pack and its source.

## Implemented vs simulated

| Real in this build                                            | Simulated / demonstration only                                                | Future work                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| DEMO JWT login, RBAC, zone-scoped responder access            | Every incident, alert, dispatch and responder (fictional seed)                | Institutional SSO and rosters                     |
| Incident reports, verification history, audit log             | Dispatch "notification" and alert delivery (local outbox adapter)             | Real notification providers                       |
| Persistent help-request lifecycle, idempotent retries         | 3D campus from unverified OpenStreetMap data, illustrative incident placement | Approved geometry, indoor routes, safe zones      |
| Offline check-in queue (per user) with honest delivery states | Synthetic DEMO instruction pack                                               | Institution-approved instruction packs            |
| Instruction-pack review/publish workflow, offline cache       | Digital drill (screen-only)                                                   | Evidence upload/storage, live updates (WebSocket) |
| Tom: approved-content answers, server-side model credentials  | Mock/Groq model in DEMO only                                                  | Reviewed Tom knowledge base                       |

## Known limitations and safety statements

- No evacuation routes, exits, assembly points or safe zones are configured; the map is **NOT FOR NAVIGATION**. "No incident recorded" never means an area is safe.
- `UNCONFIRMED` means no server-received check-in; it never means missing or injured.
- Queued (offline) requests are not delivered requests. SOS and check-ins show _received_ only after the server confirms.
- A check-in needs an incident or drill context (API contract). Without one, SOS explains this and offers **Call 112**.
- Students see incidents they reported plus those linked to alerts targeted to them.
- Evidence upload is not offered: the API stores evidence metadata only.
- Translations other than English are unreviewed drafts; safety-critical text also shows English.

## Documentation

OpenAPI `docs/api/openapi.yaml` · architecture `docs/architecture.md` · safety rules `docs/safety-rules.md` · authorisation `docs/AUTHORIZATION_MATRIX.md` · status `docs/IMPLEMENTATION_STATUS.md` · handoff `docs/AGENT_HANDOFF.md` · Windows PostgreSQL `docs/WINDOWS_POSTGRES_SETUP.md` · Tom API `services/api/src/assistant/README.md` · maps `apps/web/src/features/maps/README.md`.
