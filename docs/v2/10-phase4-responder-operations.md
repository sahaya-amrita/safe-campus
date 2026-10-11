# 10. Phase 4: responder operations and verification

Built on branch `feat/phase4-responder-ops` (from `develop-v2` at `b0b202f`).

**Decision used:** notifications stay **simulated and in-app only** (no provider was chosen). Responders are synthetic DEMO accounts; no institution-confirmed roster exists.

## What changed

| Area                             | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Duty status**                  | `PATCH /responders/me/duty` (On duty / Busy / Off duty), audited, timestamped. Only a **verified** responder who is **On duty** is matched to new help requests. The responder workspace header shows the switch; an unverified responder sees "Not verified · not matched".                                                                                                                                                                                                                                                              |
| **Matched-request inbox**        | `GET /responders/me/inbox` lists help requests the responder was matched to (Phase 3 matching), with "your zone" and new/seen. `POST /responders/me/inbox/seen` marks them seen; this is **not** an acknowledgement. Shown above the help-request queue, refreshed every 20 s. Labelled "In-app notices only (DEMO)".                                                                                                                                                                                                                     |
| **Responder roster (ADMIN)**     | `/admin/responders`: add a user who already has the RESPONDER role (starts **unverified and off duty**), change zone or role description, verify or remove verification. Removing verification also takes them off duty. An admin cannot verify their own profile. Every change needs a reason and is audited. Admin page: **Responder roster** (was a placeholder).                                                                                                                                                                      |
| **Roll call**                    | `GET /roll-call/incidents/:id` and `/roll-call/drills/:id`: each student in the scope (the incident's zone, or every zone of the drill's building, plus anyone who checked in) as **Needs help**, **No response yet** or **Said they are safe**, with last check-in time and help-request status, needing-help first. Staff only; RESPONDER-only accounts see it only for their assigned zone; every view is audited. "No response" is explicitly _not_ treated as harm or absence. Shown on incident details and for each running drill. |
| **Alert publication guard**      | An alert linked to an incident that is not VERIFIED must be marked **precautionary**, otherwise `409 INCIDENT_NOT_VERIFIED`. A student report is never published as a confirmed emergency; publishing remains an explicit ADMIN action.                                                                                                                                                                                                                                                                                                   |
| **Student sees acknowledgement** | The latest check-in card marks "Acknowledged by a responder" only when the **server** reports the help request ACKNOWLEDGED, ASSIGNED or RESOLVED (from `/help-requests/mine`). It still never says help is on the way.                                                                                                                                                                                                                                                                                                                   |

Migration `006` adds `help_request_notifications.seen_at` and `responders.duty_changed_at`.

## Verification performed

| Check                              | Result                                                                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API tests                          | 135 (7 new in `operations.integration.test.ts`)                                                                                                                                               |
| Web tests                          | 466 (6 new in `responder/operations.test.tsx`)                                                                                                                                                |
| Live, browser against `dev:memory` | Two demo SOS requests appeared in the demo responder's "Matched to you (2 new)"; duty switch shown; acknowledging one in the UI made the student's `/help-requests/mine` report ACKNOWLEDGED. |

**Not verified:** a real PostgreSQL database, real devices, real notification delivery (there is none, by decision).

## Known limits

- **Notices are in-app only.** A responder who is not looking at the workspace is not alerted. Real delivery (push, SMS, radio) needs a provider and approval.
- **Roll call depends on zone memberships.** Today these come from seed data; there is no student-facing way to set your zone yet.
- **Matching uses assigned zones, not live location.**
- **Escalation timers** in the control room remain DEMO placeholders; escalation is a prompt to phone, never automatic.
