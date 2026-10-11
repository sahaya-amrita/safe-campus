# 02. Architecture

One Amrita Sahaya application with three role-specific experiences: student, responder and administrator. All three use **one API and one database**.

## System overview

```
 Browser (installable PWA, hash routes)
 ┌───────────────────────────────────────────────────────────────┐
 │ App gate (src/app/App.tsx)                                    │
 │   /auth/*  /student/*  /responder/*  /admin/*  /help  /legal/* │
 │ Design system (src/design-system)  ·  i18n  ·  lib/offline    │
 │ Feature modules (src/features/*)   ·  Tom (src/components/tom)│
 └───────────────▲───────────────────────────────────────────────┘
                 │ HTTPS, Bearer JWT, Idempotency-Key on writes
 ┌───────────────┴───────────────────────────────────────────────┐
 │ API (services/api): Express 5, Zod validation from            │
 │ @sahaya/contracts, role checks per route, audit_events,       │
 │ idempotency_keys, outbox worker (simulated delivery), Tom     │
 └───────────────▲───────────────────────────────────────────────┘
                 │ pg
            PostgreSQL (migrations 001–003)
```

## Route tree (implemented in Phase 1)

Defined in `apps/web/src/app/routes.ts` and enforced for rendering by `App.tsx`.

| Route                                         | Who                                                        | Renders                                                           |
| --------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| `/auth/login`                                 | Signed out                                                 | DEMO sign-in (`LoginScreen`)                                      |
| `/auth/register`, `/auth/verify`              | Signed out                                                 | Labelled Phase 2 placeholder                                      |
| `/student/*`                                  | `STUDENT`                                                  | `StudentShell` (home, map, alerts, prepare, profile, report, sos) |
| `/responder/*`                                | `RESPONDER`, `INCIDENT_VERIFIER`, `DRILL_MANAGER`, `ADMIN` | `ResponderShell` on the shared `StaffLayout`                      |
| `/admin/*`                                    | `ADMIN`                                                    | `AdminShell` on the shared `StaffLayout`                          |
| `/help`, `/legal/privacy`, `/legal/prototype` | Everyone, signed in or not                                 | Public pages                                                      |
| `/` and unknown paths                         | Signed in                                                  | Redirect to the remembered page if allowed, else the role's home  |

Rules:

- **Landing:** each role lands on its own home: `ADMIN` → `/admin/dashboard`; other staff → `/responder/overview`; students → `/student/home`.
- **Wrong role:** opening another role's area shows _"Your account cannot open …"_ and a button home. No shell is mounted, so no data requests are made.
- **Signed out:** visiting a protected page remembers it for this tab only. After sign-in the user goes there, but only if their role may open it.
- **Legacy paths:** `#/home`, `#/sos`, `#/r/...` and `#/login` redirect to the new tree, so bookmarks and installed start URLs keep working.
- **No API configured:** only the labelled student mock preview exists, and staff areas explain that they need the API.
- **Not a security boundary.** Route guards only decide what to render. The API authorises every request from the server-issued roles in the JWT (`requireRoles` per route), and roles are never chosen by the client.

### Shared staff layout

- **`StaffLayout`** (`src/app/staff/StaffLayout.tsx`) provides the sidebar, mode banner, drill banner, title bar, 112 link and Tom for both staff workspaces.
- **`StaffWorkspaceProvider` / `useStaffLink`** (`src/app/staff/workspace.tsx`) let shared views link to a section ("incidents") inside the current workspace when it has that section, or otherwise in the responder workspace.

## Layers and ownership

| Layer                 | Path                                                          | Notes                                                                |
| --------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------- |
| App shell and routing | `apps/web/src/app/`                                           | Gate, session (`auth/session.tsx`), API client (`api/`), role shells |
| Design system         | `apps/web/src/design-system/`                                 | Tokens, components, fonts ([05](./05-ui-design-system.md))           |
| Student feature       | `apps/web/src/features/student/`                              | Check-in queue, location, photos, packs, components                  |
| Offline               | `apps/web/src/lib/offline/`                                   | IndexedDB queue (idempotent), caches, online status                  |
| i18n                  | `apps/web/src/i18n/`                                          | `en` source plus five unreviewed drafts                              |
| Tom                   | `apps/web/src/components/tom/`, `services/api/src/assistant/` | Server-side LLM provider (Groq or mock), rule-based refusals         |
| Maps and twin         | `apps/web/src/app/twin/`, `apps/web/src/features/maps/`       | 2D/3D views, DEMO routes                                             |
| Contracts             | `packages/contracts/`                                         | Single source for enums and request schemas                          |
| API                   | `services/api/`                                               | Routes, migrations, outbox, audit, idempotency                       |

## Screen architecture

Status key:

- **Built:** working today against the API.
- **Partial:** working, with a known gap.
- **Placeholder:** route exists and is labelled as not functional.
- **Planned:** no route yet.

### Student

| Screen                            | Route                               | Status                                  | Phase           |
| --------------------------------- | ----------------------------------- | --------------------------------------- | --------------- |
| Welcome and onboarding            | —                                   | Planned                                 | 2               |
| Login and registration            | `/auth/login`, `/auth/register`     | Partial (DEMO login only) / Placeholder | 2               |
| Email OTP verification            | `/auth/verify`                      | Placeholder                             | 2               |
| Home dashboard                    | `/student/home`                     | Built                                   | —               |
| SOS (hold to activate, 112 first) | `/student/sos`                      | Built                                   | 3 (matching)    |
| I'm Safe / I Need Help            | `/student/home` (help sheet)        | Built                                   | —               |
| Incident reporting                | `/student/report`                   | Built (unverified until reviewed)       | 3 (contract v2) |
| Report a concern (non-emergency)  | —                                   | Planned                                 | 3               |
| Map and digital twin              | `/student/map`                      | Partial (DEMO geometry, not navigation) | 5               |
| Safe-point navigation             | —                                   | Planned; blocked on verified data       | 5               |
| Alerts and notifications          | `/student/alerts`                   | Built (in-app inbox; no push)           | 4               |
| Safety resources                  | `/student/prepare`                  | Built (published packs only)            | —               |
| Virtual drills                    | `/student/prepare` (drill practice) | Partial                                 | 6               |
| Progress                          | —                                   | Planned (training results API exists)   | 6               |
| Trusted contacts                  | `/student/profile`                  | Built                                   | —               |
| Profile and settings              | `/student/profile`                  | Built                                   | —               |
| Help and Tom                      | `/help`, Tom launcher               | Built (Tom help content is DRAFT)       | 6 (3D Tom)      |

### Responder (`/responder/*`)

| Screen                                        | Section                                                 | Status                         |
| --------------------------------------------- | ------------------------------------------------------- | ------------------------------ |
| Dashboard (control room)                      | `overview`                                              | Built                          |
| Duty status                                   | —                                                       | Planned (Phase 4)              |
| SOS / help-request queue                      | `help`                                                  | Built                          |
| Request details, acknowledge, assign, resolve | `help`                                                  | Built                          |
| Assignment management, dispatches             | `dispatches`                                            | Partial (simulated dispatches) |
| Incident review and search                    | `incidents`                                             | Built                          |
| Safety status and roll call                   | `incidents/<id>` and the control room's check-in counts | Partial                        |
| Map context, blocked areas                    | `map`                                                   | Partial (DEMO routes)          |
| Alerts, packs, drills, contacts               | `alerts`, `packs`, `drills`, `contacts`                 | Built (contacts unverified)    |
| Profile                                       | —                                                       | Planned (Phase 2)              |

### Administrator (`/admin/*`)

| Screen                | Section       | Status                                                               |
| --------------------- | ------------- | -------------------------------------------------------------------- |
| Dashboard             | `dashboard`   | Built (lists only real and planned sections, no invented statistics) |
| Incident verification | `incidents`   | Built (shared view)                                                  |
| Alert management      | `alerts`      | Built (shared view)                                                  |
| Drill management      | `drills`      | Built (shared view)                                                  |
| Safety guides         | `guides`      | Built (pack review and publish)                                      |
| Campus contacts       | `contacts`    | Partial (unverified directory)                                       |
| Users and roles       | `users`       | Placeholder, hidden from navigation (Phase 2)                        |
| Audit logs            | `audit`       | Placeholder, hidden (Phase 2)                                        |
| Responder management  | `responders`  | Placeholder, hidden (Phase 4)                                        |
| Campus map data       | `map-data`    | Placeholder, hidden (Phase 5)                                        |
| Safe-point approvals  | `safe-points` | Placeholder, hidden (Phase 5)                                        |
| System settings       | `settings`    | Placeholder, hidden (Phase 7)                                        |

## Authentication (Phase 2)

- **Sign-in:** email one-time codes issued and checked by the API (`/auth/otp/request`, `/auth/otp/verify`). The API issues a 2-hour JWT.
- **Every request** reloads the account's status, revoked sessions and roles from the database, so roles in a token are never trusted.
- **Registration:** allow-listed domains only, always as STUDENT. Staff roles are granted only by an ADMIN, and every grant is audited.
- **DEMO password login:** development and tests only.
- **Token storage:** `sessionStorage`, so it ends with the tab.

Details are in [08](./08-phase2-authentication.md).
