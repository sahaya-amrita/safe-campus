# 06. Phase roadmap

Each phase ends with a review. The next phase starts only after approval. The milestones (M1–M8) refer to `docs/plans/master-implementation-plan.md`.

## Phase 1: foundation (this phase, done)

- **Repository:** new repository, remotes and `develop-v2` with all upstream history (push awaiting approval).
- **Documentation:** audit, inventory and branch report (docs 01–04).
- **Routing:** route tree with role-separated areas, legacy redirects and public help/legal pages.
- **Admin console:** shell built on real endpoints, with planned sections as labelled placeholders.
- **Design system:** blue-and-white tokens and components, with the app re-themed.
- **Fixes:** Tom tour focus bug and its racy test.

## Phase 2: authentication and account security (built; see [08](./08-phase2-authentication.md))

| Item                                                                                           | Status                                                                                   |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Email one-time-code sign-in and registration (`/auth/login`, `/auth/register`, `/auth/verify`) | **Built.** The API's own codes (decision 2026-10-11).                                    |
| Guest access                                                                                   | **Not in scope** (decision: accounts only)                                               |
| DEMO login disabled in production                                                              | **Built.** 404 unless `DEMO_LOGIN_ENABLED=true`; configuration refuses it in production. |
| Users and roles (`/admin/users`)                                                               | **Built.** Audited, reason required, with self and last-admin guards.                    |
| Audit-log viewer (`/admin/audit`)                                                              | **Built.** Read-only.                                                                    |
| Welcome and onboarding                                                                         | **Built.** Shown once to new student accounts; no permission prompts.                    |
| Sign out everywhere, disabling accounts                                                        | **Built**                                                                                |
| Hosted Postgres (Supabase or other), RLS                                                       | **Not done.** Needs credentials; the API still uses any Postgres via `DATABASE_URL`.     |
| Real email sender                                                                              | **Ready, not verified.** Resend adapter; needs a key and verified sender.                |

## Phase 3: SOS, reporting and permissions (built; see [09](./09-phase3-reporting-sos.md))

| Item                                                                   | Status                                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Report contract v2 (category, kind, location, floor rule, attachments) | **Built**                                                                                    |
| Contextual location and camera permissions                             | **Built** (`PermissionNotice` before the location prompt; landmark fallback)                 |
| SOS without a drill or incident, quick help without text               | **Built** (`POST /sos`)                                                                      |
| Responder matching                                                     | **Built** (up to three verified, available responders; simulated notice; never auto-assigns) |
| Photo upload with server-side metadata stripping                       | **Built** (stored in Postgres for now)                                                       |
| Report a concern (non-urgent)                                          | **Built** (`kind: CONCERN`, no dispatch)                                                     |

## Phase 4: responder operations and verification (M5)

| Item                                                    | Integration boundary                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Duty status, responder management (`/admin/responders`) | Roster create/update endpoints; synthetic responders only until institution data exists       |
| Incident verification and alert publication             | Verification by authorised reviewers only; alerts are published only by explicit human action |
| Notifications                                           | Outbox to a real provider only after approval; DEMO stays simulated                           |
| Evidence viewer                                         | Signed URLs, 403 for unauthorised roles, reviewer identity in the audit log                   |
| Roll call                                               | Per-person safety status per incident or drill                                                |

## Phase 5: maps, digital twin and safe points (M6)

| Item                                                                        | Integration boundary                                                                                                                |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Digital twin representation                                                 | 2D floor-plan viewer; 3D only if approved                                                                                           |
| Verified safe-point routing                                                 | A* with a Dijkstra baseline over an approved graph. Without verified data the app says "Navigation unavailable" and draws no route. |
| Map data and safe-point approvals (`/admin/map-data`, `/admin/safe-points`) | Versioned geometry with an approval workflow                                                                                        |

## Phase 6: drills, learning and Tom

| Item                        | Integration boundary                                           |
| --------------------------- | -------------------------------------------------------------- |
| Virtual drills and progress | Uses `/training/results`; drills are always labelled as drills |
| 3D floating Tom             | Presentation only. Tom never initiates consequential actions.  |
| Tom knowledge review        | A named reviewer approves the help content                     |

## Phase 7: administration, analytics and deployment (M7, M8)

| Item                                | Integration boundary                                                 |
| ----------------------------------- | -------------------------------------------------------------------- |
| System settings (`/admin/settings`) | Server-side settings API, audited; approved acknowledgement timers   |
| Descriptive analytics               | Labelled synthetic until real history exists; no prediction          |
| Privacy and support pages, final    | Replace the Phase 1 drafts after institutional and legal review      |
| Deployment                          | Production CORS, host secrets, second-device and real-device testing |

## Prerequisites for Phase 4 (owner actions)

1. **Review and approve** Phase 3 (`feat/phase3-reporting`).
2. **Notifications:** decide whether responders get real notifications (provider, channel) or stay simulated for now.
3. **Responders:** confirm who the responders are and their zones; only synthetic responders exist today.
4. **Photos:** choose private object storage (and a retention period) before any real photos are collected.
5. **Database and email:** still needed from Phase 2: a Postgres database for development and staging, and an email provider with a verified sender.
6. **Groq key:** rotate it (still outstanding).
