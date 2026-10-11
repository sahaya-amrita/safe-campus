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

## Phase 4: responder operations and verification (built; see [10](./10-phase4-responder-operations.md))

| Item                                                | Status                                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Duty status, responder roster (`/admin/responders`) | **Built** (synthetic responders; audited)                                                    |
| Incident verification and alert publication         | **Built** (verification existed; alerts about unverified incidents must be precautionary)    |
| Notifications                                       | **Simulated, in-app only** (matched-request inbox); real delivery awaits a provider decision |
| Evidence viewer                                     | **Built in Phase 3** (audited photo views)                                                   |
| Roll call                                           | **Built** (per person, incident and drill)                                                   |

## Phase 5: maps, digital twin and safe points (built; see [11](./11-phase5-maps-navigation.md))

| Item                              | Status                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------- |
| Digital twin representation       | **Kept** (2D map and 3D illustration, both labelled unverified)                   |
| Verified safe-point routing       | **Built** (A\* over approved route data only; "Navigation unavailable" otherwise) |
| Map data and safe-point approvals | **Built** (two-person rule, audited)                                              |

## Phase 6: drills, learning and Tom (built; see [12](./12-phase6-drills-learning-tom.md))

| Item                        | Status                                                                         |
| --------------------------- | ------------------------------------------------------------------------------ |
| Virtual drills and progress | **Built** (progress screen; drill after-action reviews with follow-up actions) |
| Tom knowledge review        | **Built** (named reviewer; approval tied to exact wording)                     |
| 3D floating Tom             | **Not done** (presentation only; deferred)                                     |

## Phase 7: administration, analytics and deployment (built; see [13](./13-phase7-admin-analytics-deploy.md))

| Item                             | Status                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| System settings                  | **Built** (audited, source required; control room uses them)                                            |
| Descriptive analytics            | **Built** (counts only; labelled synthetic in DEMO; no prediction)                                      |
| Privacy and support pages, final | **Draft remains** (needs institutional and legal review)                                                |
| Deployment                       | **Hardened** (production seed, photo purge, proxy); the live deployment is run by the integration owner |

## What remains after Phase 7 (owner actions, not code)

1. **Institutional data:** verified route data and safe points (two administrators to approve), confirmed responder roster and zones, approved campus contacts and instruction packs.
2. **Accounts and services:** production database, email provider and verified sender, first administrator, agreed ERT timers in System settings, a named reviewer for Tom's help text.
3. **Reviews:** legal and institutional review of the privacy and help pages; native-speaker review of the five draft translations; accessibility audit with screen readers.
4. **Testing:** real-device testing (Android Chrome, iPhone Safari) of sign-in, SOS, GPS, camera, offline and install.
5. **Security:** rotate the Groq key that was exposed in a chat transcript.
6. **Deferred features:** 3D floating Tom; indoor and floor-level routing; real notification delivery (needs a provider decision); background sync on Android.
