# 07. Safety boundaries

Amrita Sahaya is an emergency-preparedness **prototype**. It is not institutionally approved, not production-ready, and not connected to campus security, alarms or emergency services. University authorisation, verified responder operations, approved maps and procedures, and real-device testing are required before any real emergency use.

## Rules and where they are enforced today

| Rule                                                   | Enforcement in code                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A queued offline SOS is never shown as delivered       | `lib/offline` queue states: `LOCAL_ONLY` / `QUEUED` until a server receipt. `sosSteps` and `DeliveryTrack` tests. The `OfflineIndicator` never says "delivered".                                                                                                                                 |
| "Responder on the way" only after confirmed acceptance | Help-request status comes only from the server (`OPEN` → `ACKNOWLEDGED` → `ASSIGNED`). `HELP_STATUS` labels in `app/ui.tsx`.                                                                                                                                                                     |
| Student reports are never auto-published as alerts     | `POST /incidents` stores `REPORTED`. Alerts need an ADMIN to draft and authorise them. Derived hazard levels are display-only.                                                                                                                                                                   |
| No invented routes or safe destinations                | Map routes are labelled "DEMO · not approved". Safe-point approval is a Phase 5 placeholder with no data.                                                                                                                                                                                        |
| Demonstration data kept separate from operational data | `OperatingMode` banners (DEMO, DRILL, TEST, SIMULATION, MOCK) on every shell; the striped DRILL banner; synthetic seed accounts at `example.invalid`                                                                                                                                             |
| No real emergency messages                             | The outbox worker simulates delivery ("no external provider contacted")                                                                                                                                                                                                                          |
| No contact with real university personnel              | Campus contacts are unverified placeholders; no outbound messaging exists                                                                                                                                                                                                                        |
| No unauthorised role elevation                         | `authenticate` reloads roles, account status and revoked sessions from the database on every request (token roles are ignored). Only ADMIN endpoints change roles, each with a reason and an audit event; self-demotion and last-admin removal are refused. `PATCH /users/me` drops role fields. |
| Tom cannot take consequential actions                  | Rule-based refusals on the client and server; Tom only navigates app screens; tests cover refusals                                                                                                                                                                                               |
| No claim of approval or readiness                      | `/legal/prototype`, the login banner, and the help and privacy pages say so explicitly                                                                                                                                                                                                           |

## Boundaries for future phases

These are integration contracts for later phases. **None of them is implemented in Phase 1.**

- **Email OTP and account security.** Built in Phase 2 ([08](./08-phase2-authentication.md)). Remaining: hosted database, real email provider, refresh tokens if sessions must outlive 2 hours.
- **Contextual permissions.** A `PermissionNotice` comes before any browser prompt, every permission has a working fallback, and nothing is requested at start-up.
- **SOS and responder matching.**
  - Matching happens on the server.
  - The student sees only server-confirmed states.
  - 112 is always offered first.
- **Incident verification and alert publication.** Only an authorised reviewer can verify, publishing is an explicit audited human action, and drills are always labelled as drills.
- **Photo storage.** Private storage with signed URLs. EXIF is stripped on the device. Partial upload failures are visible. Access is role-checked and audited.
- **Digital twin and safe-point routing.** Only institution-approved geometry. Without it the app shows "Navigation unavailable", never a guessed route.
- **Offline queuing and sync.**
  - Idempotency keys on every write.
  - Saved-on-device is never presented as sent.
  - Background sync, where available, follows the same rule.
- **Virtual drills.** The drill kill switch stays available to all staff. Starting a drill while a verified incident is open is blocked.
- **3D Tom.** Presentation only. Answers are labelled with their source, and Tom refuses consequential actions.
- **Notifications.** No real provider until approved. DEMO and DRILL messages are always labelled.
- **Privacy and support pages.** The Phase 1 drafts must be reviewed by the institution and legal counsel before launch.

## Testing data

Tests use **synthetic** people, incidents and responders only (`example.invalid` emails, generated UUIDs) and an in-memory database (`pg-mem`). No test contacts a real service.
