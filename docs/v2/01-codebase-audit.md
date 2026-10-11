# 01. Codebase audit

Amrita Sahaya 2.0, Phase 1. Audit of the code inherited from `sahaya-amrita/safe-campus`, taken on **2026-10-11** from `develop-v2` at `10c65be`, before any Phase 1 change.

## Repository set-up (verified)

| Item            | Value                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Local workspace | `D:\amrita-sahaya-v2` (the original `D:\safe-campus` was not modified)                                                 |
| `origin`        | `https://github.com/tmiruna3-rgb/amrita-sahaya-v2.git` (empty when audited)                                            |
| `upstream`      | `https://github.com/sahaya-amrita/safe-campus.git`, fetch only (push URL `DISABLED_READ_ONLY`)                         |
| Working branch  | `develop-v2`                                                                                                           |
| History         | All upstream commits are kept. `develop-v2` contains every upstream branch tip (see [04](./04-branch-integration.md)). |

## Stack

| Layer            | Technology                                                                    | Location                                   |
| ---------------- | ----------------------------------------------------------------------------- | ------------------------------------------ |
| Monorepo         | pnpm 11 workspace, Node 22+ (24 used here), TypeScript 5.9 strict             | root `package.json`, `pnpm-workspace.yaml` |
| Shared contracts | Zod 4 schemas and enums (`@sahaya/contracts`)                                 | `packages/contracts/`                      |
| API              | Express 5, `pg`, `jose` JWT, pino, helmet                                     | `services/api/`                            |
| Database         | PostgreSQL. Migrations `001`–`003`. Tests use `pg-mem` in memory.             | `services/api/migrations/`                 |
| Web              | React 19, Vite 8, vite-plugin-pwa (Workbox), Vitest 5 + jsdom, Three.js 0.180 | `apps/web/`                                |
| Maps timeline    | TypeScript and `node --test`                                                  | `modules/maps-drills/`                     |
| Deploy blueprint | Render (API, static web, Postgres). Never deployed.                           | `render.yaml`                              |
| Local DB         | Docker Compose Postgres on port 55432                                         | `docker-compose.yml`, `infra/postgres/`    |

## Baseline quality gates (before Phase 1 changes)

All results come from this machine (Windows 11, Node 24.12, pnpm 11.25 via `npx`).

| Gate       | Command                          | Result                                                                                                                             |
| ---------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Install    | `pnpm install --frozen-lockfile` | Passed (already up to date)                                                                                                        |
| Type-check | `pnpm typecheck`                 | Passed (contracts, API and web)                                                                                                    |
| Lint       | `pnpm lint`                      | Passed                                                                                                                             |
| Format     | `pnpm format:check`              | **Failed: 88 files** not Prettier-formatted on upstream `main`. These are real differences, not line endings (the checkout is LF). |
| API tests  | `pnpm --filter @sahaya/api test` | 4 files, **96 passed** (pg-mem, no real Postgres)                                                                                  |
| Web tests  | `pnpm --filter @sahaya/web test` | **2 failed**, 413 passed (Tom guided tour). See below.                                                                             |
| Node tests | `test:node`                      | 38 passed                                                                                                                          |
| OpenAPI    | `pnpm openapi:validate`          | Valid                                                                                                                              |
| Build      | `pnpm build`                     | Passed; 64 precache entries (4.0 MB)                                                                                               |

### Failures found and fixed

`src/components/tom/Tom.test.tsx`:

- **"highlights registered targets and navigates…"** fails intermittently. The test read the current view before the tour's asynchronous navigation finished, so it now waits for it.
- **"Escape ends the tour from anywhere and restores focus"** fails every time. This is a **real focus bug**: if the user moved focus onto the page during the (non-modal) tour, ending it with Escape pulled focus away to the launcher.
  - Fix in `Tom.tsx` `endTour`: focus that is already on the page stays there, and only focus inside the closing tour card is restored.

After the fix, the suite passed three runs in a row (120 of 120 Tom tests).

## Security and secrets review (before any push)

Scanned all tracked files and the **entire history of every branch** for:

- Groq (`gsk_`), Supabase secret, AWS, GitHub and Slack tokens;
- private keys and JWTs;
- remote Postgres URLs with passwords;
- `.env` files ever added;
- `GROQ_API_KEY=` / `SUPABASE_SECRET_KEY=` / `JWT_SECRET=` with values.

**No secrets were found.** Things to know:

- **Fictional demo passwords are published by design.** They appear in `services/api/.env.example`, `LoginScreen.tsx` and the seed. One of them is an **ADMIN** password, and `POST /auth/demo-login` has **no production guard**. This must be fixed before any deployment (Phase 2).
- `docker-compose.yml` contains a local-only Postgres password (`sahaya_local_only`).
- `docs/plans/master-implementation-plan.md` names a Supabase project ref. That's an identifier, not a credential, and it is already public upstream.
- The handoff notes say a Groq key was once pasted into a chat. It is **not** in Git, but it must be rotated.

## Structure findings

- `apps/web` is already one role-aware app (`src/app/`) that reuses the feature modules.
  - Before Phase 1, it chose the workspace from the user's roles at sign-in (student vs any staff role). Paths were flat: `#/home` and `#/r/...`.
  - There was **no admin area**: ADMIN users shared the responder workspace.
- **API endpoints exist for:** auth (demo login), users/me, check-ins, help requests, incidents (with derived hazard levels), alerts and inbox, instruction packs, drills (preflight, start, stop, kill switch), maps (buildings, blocks), responders, trusted contacts and training results.
- **No endpoints exist for:** user and role management, audit-log reads, system settings, photo upload, safe-point approval, or map-data editing.
- Notifications are simulated by an in-process outbox worker ("no external provider contacted").
- Several older feature modules are no longer wired into the app (see [03](./03-feature-inventory.md)).
