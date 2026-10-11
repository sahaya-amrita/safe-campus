# 03. Feature inventory

**Classification:**

1. Implemented and integrated
2. Implemented but disconnected
3. Mock or simulation only
4. Partially implemented
5. Missing

Paths are relative to the repository root. "Integrated" means reachable in the unified app _and_ backed by the API.

## Student mobile application

| Feature                                                | Class | Sources                                                                                  | Depends on                                                                                         |
| ------------------------------------------------------ | ----- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Home dashboard                                         | 1     | `apps/web/src/app/student/StudentHome.tsx`, `features/student/components/HomeScreen.tsx` | `GET /drills`, `/incidents`, `/alerts/inbox`                                                       |
| I'm Safe / I Need Help (check-ins)                     | 1     | `features/student/checkIn/*`, `components/HelpSheet.tsx`, `contracts/studentContract.ts` | `POST /checkins` (incident or drill required)                                                      |
| Honest delivery states (LOCAL_ONLY → … → ACKNOWLEDGED) | 1     | `components/DeliveryTrack.tsx`, `app/student/SosScreen.tsx` (`sosSteps`)                 | `MessageDeliveryStatus` in contracts                                                               |
| SOS screen (1.5 s hold, 112 first)                     | 1     | `apps/web/src/app/student/SosScreen.tsx`                                                 | `POST /checkins` and `/help-requests/mine`; no responder matching                                  |
| GPS capture                                            | 4     | `features/student/location/useLocationCapture.ts`                                        | Secure context. No location field in the contract, so the position goes into the help text.        |
| Camera and photo processing (EXIF stripped)            | 4     | `features/student/attachments/*`                                                         | **No upload endpoint**: photos stay on the device                                                  |
| IndexedDB offline queue                                | 1     | `apps/web/src/lib/offline/*`, `app/student/core.tsx` (`OwnerScopedQueueStore`)           | —                                                                                                  |
| Offline / PWA caching                                  | 4     | `apps/web/vite.config.ts` (Workbox), `lib/offline/appShell.ts`                           | Not verified on real devices                                                                       |
| Safety guides (instruction packs)                      | 1     | `app/student/PrepareScreen.tsx`, `features/student/instructions/*`                       | `GET /instruction-packs` (published only, en/ta)                                                   |
| Incident reporting                                     | 1     | `app/IncidentForm.tsx`, `app/student/ReportIncidentScreen.tsx`                           | `POST /incidents` (always unverified)                                                              |
| Alerts inbox and acknowledgement                       | 1     | `app/student/AlertsScreen.tsx`                                                           | `/alerts/inbox`, `POST /alerts/:id/acknowledge`                                                    |
| Trusted contacts                                       | 1     | `app/student/ProfileScreen.tsx`                                                          | `/trusted-contacts` CRUD                                                                           |
| Language dictionaries (6)                              | 4     | `apps/web/src/i18n/*`                                                                    | `ta`, `hi`, `ml`, `te`, `kn` are unreviewed drafts. The unified shell's tab labels are en/ta only. |
| Student activity and history                           | 1     | `features/student/components/RecentActivity.tsx`, `SyncStatus.tsx`                       | —                                                                                                  |
| Practice drill                                         | 4     | `app/student/DrillPractice.tsx`, `features/drills/*`                                     | Local simulation; results via `/training/results`                                                  |
| Progress view                                          | 5     | —                                                                                        | Training results API exists; no screen                                                             |
| Standalone student harness (`StudentApp`)              | 2     | `features/student/StudentApp.tsx`                                                        | Superseded by `app/student/*`; kept for its tests                                                  |

## Responder and administrator

| Feature                                                               | Class              | Sources                                                                           | Depends on                                                                     |
| --------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Responder workspace shell                                             | 1                  | `app/responder/ResponderShell.tsx`, `app/staff/StaffLayout.tsx`                   | —                                                                              |
| Control room (help timers, hazard queue L1–L3)                        | 1                  | `app/responder/ControlRoom.tsx`, `controlRoomModel.ts`                            | `/help-requests`, `/incidents` (derived levels). Timers are DEMO placeholders. |
| Help-request queue: acknowledge, assign, resolve                      | 1                  | `app/responder/views.tsx` (`HelpRequestsView`)                                    | `/help-requests/*` (role and zone checks)                                      |
| Incident search and filters                                           | 1                  | `app/responder/IncidentSearch.tsx`, `incidentFilters.ts`                          | `GET /incidents`                                                               |
| Incident review and verification                                      | 1                  | `app/responder/views.tsx` (`IncidentDetailView`)                                  | `POST /incidents/:id/reviews`                                                  |
| Roll call / safety status                                             | 4                  | Control-room check-in counts, `features/responder/RollCallSummary.tsx`            | `GET /checkins/summary`; no per-person roll call                               |
| Dispatches                                                            | 3                  | `DispatchesView`                                                                  | Simulated dispatch records                                                     |
| Alert management                                                      | 1                  | `AlertsView`, `AlertComposer`                                                     | `POST /alerts` (ADMIN); delivery is simulated                                  |
| Drill console (preflight, start, stop, kill switch)                   | 1                  | `app/responder/drillControl.tsx`, `app/DrillBanner.tsx`                           | `/drills/*`                                                                    |
| Instruction-pack review and publish                                   | 1                  | `PacksView`                                                                       | `/instruction-packs/*`                                                         |
| Campus contacts                                                       | 4                  | `features/responder/ContactsView.tsx`, `campusDirectory.ts`                       | No institution-verified contacts                                               |
| Authorization checks                                                  | 1                  | `services/api/src/middleware.ts` (`requireRoles`), route handlers                 | JWT roles from the DB                                                          |
| Admin console shell                                                   | 1 (new in Phase 1) | `app/admin/*`                                                                     | ADMIN role                                                                     |
| Users and roles, audit-log viewer, responder roster editing, settings | 5                  | Placeholders in `app/admin/plannedSections.ts`                                    | No API                                                                         |
| Older responder dashboard harness                                     | 2                  | `features/responder/ResponderDashboard.tsx`, `HelpRequestQueue.tsx`, `mockApi.ts` | Superseded by `app/responder/*`                                                |
| Hazard review queue module                                            | 2                  | `features/incidents/HazardReviewQueue.tsx`, `hazardReview.ts`                     | Superseded by the control room's hazard queue                                  |

## Backend

| Feature                                      | Class | Sources                                                                       |
| -------------------------------------------- | ----- | ----------------------------------------------------------------------------- |
| Express API, validation, error model         | 1     | `services/api/src/app.ts`, `errors.ts`, `middleware.ts`                       |
| PostgreSQL schema                            | 1     | `services/api/migrations/001`–`003`                                           |
| Authentication                               | 4     | `routes/auth.ts`, `security.ts`: DEMO login only, no production guard, no OTP |
| Shared Zod contracts                         | 1     | `packages/contracts/src/`                                                     |
| Incident lifecycle with derived hazard level | 1     | `routes/incidents.ts`, `hazardLevel.ts`                                       |
| Alert management and inbox                   | 1     | `routes/alerts.ts`                                                            |
| Notification delivery                        | 3     | `outbox.ts`: simulated, no external provider                                  |
| Drill APIs with kill switch                  | 1     | `routes/drills.ts`                                                            |
| Responder APIs                               | 4     | `routes/responders.ts`: list and appropriate-responder only                   |
| Audit and idempotency                        | 1     | `audit.ts`, `idempotency.ts` (audit has no read endpoint)                     |
| Photo / evidence storage                     | 5     | `incident_evidence` table holds metadata only                                 |

## Maps and digital twin

| Feature                                              | Class | Sources                                                                                                         |
| ---------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------- |
| 2D safe-route map with risk, alert and blocked areas | 4     | `app/twin/SafeMap2D.tsx`, `CampusMapPanel.tsx`, `features/maps/safe-route.ts`. Routes are "DEMO, not approved". |
| 3D view (Three.js)                                   | 4     | `app/twin/SafeMap3D.tsx`, `features/maps/campus-scene.mjs`. The master plan proposes removing it.               |
| Campus geometry                                      | 3     | `features/maps/campus-model.ts`: OSM-derived and unverified                                                     |
| Route blocks                                         | 1     | `routes/maps.ts`, migration `003`                                                                               |
| 3D campus explorer and drill simulation views        | 2     | `features/maps/map-view.ts`, `verified-map-view.ts`, `simulation-view.ts`, `linked-drill-store.ts`              |
| Drill timeline                                       | 2     | `modules/maps-drills/timeline.ts` (node tests only)                                                             |
| Safe-point models and verified routing (A*)          | 5     | —                                                                                                               |

## Tom

| Feature                                                    | Class | Sources                                                                            |
| ---------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------- |
| Tom assistant UI, navigation adapter, refusals             | 1     | `apps/web/src/components/tom/*`, `app/TomHost.tsx`                                 |
| Server assistant (Groq or mock provider, schema-validated) | 1     | `services/api/src/assistant/*`. Live only with a Groq key.                         |
| Knowledge base                                             | 4     | `knowledgeBase.ts`, `assistant/content.ts`: DRAFT app help, needs a named reviewer |
| Guided tour                                                | 1     | `TourRunner.tsx`, `tourTargets.tsx` (responder workspace)                          |
| 3D floating Tom                                            | 5     | —                                                                                  |
| Safe navigation tools                                      | 4     | Opens app screens only, never physical routes                                      |
