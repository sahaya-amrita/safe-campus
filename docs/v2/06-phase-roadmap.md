# 06. Phase roadmap

Each phase ends with a review. The next phase starts only after approval. The milestones (M1–M8) refer to `docs/plans/master-implementation-plan.md`.

## Phase 1: foundation (this phase, done)

- **Repository:** new repository, remotes and `develop-v2` with all upstream history (push awaiting approval).
- **Documentation:** audit, inventory and branch report (docs 01–04).
- **Routing:** route tree with role-separated areas, legacy redirects and public help/legal pages.
- **Admin console:** shell built on real endpoints, with planned sections as labelled placeholders.
- **Design system:** blue-and-white tokens and components, with the app re-themed.
- **Fixes:** Tom tour focus bug and its racy test.

## Phase 2: authentication and account security (M1, M2)

| Item                                                                  | Integration boundary                                                                                                                   |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Email OTP sign-in and registration (`/auth/register`, `/auth/verify`) | Replace `SessionProvider.signIn` and `POST /auth/demo-login`. The API verifies provider JWTs (JWKS) and loads roles from `user_roles`. |
| Guest access (if approved)                                            | A guest identity can report, but cannot list other people's reports                                                                    |
| Disable demo login in production                                      | `/auth/demo-login` returns 404 when `NODE_ENV=production`; the seed passwords become irrelevant                                        |
| Users and roles (`/admin/users`)                                      | ADMIN-only endpoints; role changes are audited; never client-chosen                                                                    |
| Audit-log viewer (`/admin/audit`)                                     | ADMIN-only, paginated read over `audit_events`                                                                                         |
| Welcome and onboarding                                                | Student-only, first run, skippable, no permission prompts                                                                              |
| Supabase Postgres, RLS or unexposed tables                            | Migrations 001–003 on the new database. Secrets only in `services/api/.env` and host secrets.                                          |

## Phase 3: SOS, reporting and permissions (M3, M4)

| Item                                                | Integration boundary                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Report contract v2                                  | `packages/contracts`: location method, coordinates and accuracy, floor, category, attachment lifecycle. OpenAPI updated.              |
| Contextual location, camera and contact permissions | `PermissionNotice` before every browser prompt; a fallback always exists                                                              |
| SOS creation and responder matching                 | The server creates the help request and matches it by zone and duty. "Responder on the way" is shown only after confirmed acceptance. |
| Photo upload                                        | Private bucket, signed URLs, EXIF already stripped on the device. Partial-failure states are shown honestly.                          |
| Report a concern                                    | Non-emergency report flow (never auto-published as an alert)                                                                          |

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

## Prerequisites for Phase 2 (owner actions)

1. **Review and approve** Phase 1, then approve `git push -u origin develop-v2`.
2. **Identity provider:** confirm Supabase Auth with email OTP, or name another provider. Decide whether guest access is in scope.
3. **Email OTP:** provide a database connection string and server secret privately, in `services/api/.env` only, never in chat or Git. Enable email OTP in the provider and configure a sender.
4. **Groq key:** rotate it, since the old one was exposed in a chat transcript.
5. **Roles:** confirm the role model (`STUDENT`, `RESPONDER`, `INCIDENT_VERIFIER`, `DRILL_MANAGER`, `ADMIN`) and who may grant each role.
6. **Isolation:** confirm the new repository uses its own development database, storage and notification configuration, separate from the original project.
