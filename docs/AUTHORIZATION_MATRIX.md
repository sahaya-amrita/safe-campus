# API Core v1 authorization matrix

The API trusts only roles loaded from the database and embedded in a server-issued JWT. Request body fields never grant a role. Unless noted otherwise, every `/api/v1` endpoint requires authentication.

| Interface                              | STUDENT         | RESPONDER          | INCIDENT_VERIFIER | DRILL_MANAGER      | ADMIN | Scope and enforcement                                                                                      |
| -------------------------------------- | --------------- | ------------------ | ----------------- | ------------------ | ----- | ---------------------------------------------------------------------------------------------------------- |
| `GET /users/me`                        | Yes             | Yes                | Yes               | Yes                | Yes   | Returns only the authenticated identity and server-owned roles.                                            |
| `POST /incidents`                      | Yes             | Yes                | Yes               | Yes                | Yes   | Actor is recorded as reporter; idempotency key is required.                                                |
| `GET /incidents`                       | Own reports     | Yes                | Yes               | No privileged view | Yes   | Students are restricted to incidents they reported.                                                        |
| `GET /incidents/{id}`                  | Own report only | Yes                | Yes               | No privileged view | Yes   | Student access to another student's incident is forbidden.                                                 |
| `POST /incidents/{id}/reports`         | Yes             | Yes                | Yes               | Yes                | Yes   | Adds eyewitness information; never changes verification status.                                            |
| `POST /incidents/{id}/reviews`         | No              | No                 | Yes               | No                 | Yes   | Authorized review transition and audit event are transactional.                                            |
| `POST /checkins`                       | Yes             | No                 | No                | No                 | No    | Exactly one incident or drill target; existing target, idempotency key, and client action ID are required. |
| `GET /checkins/me/latest`              | Yes             | No                 | No                | No                 | No    | Exactly one `incidentId` or `drillId`; always owner-scoped.                                                |
| `GET /help-requests`                   | No              | Assigned zone      | All               | No                 | All   | Cursor-paginated; responders require a verified on-duty profile and see only their assigned zone.          |
| Help acknowledge/assign                | No              | Assigned zone/self | No                | No                 | Yes   | Assignment is limited to a verified on-duty responder in the same zone.                                    |
| Help resolve                           | No              | Assigned responder | No                | No                 | Yes   | Only the assigned responder or administrator may resolve.                                                  |
| Help cancel                            | Owner           | No                 | No                | No                 | Yes   | Unrelated students cannot cancel another student's request.                                                |
| `GET /incidents/{id}/checkins/summary` | No              | Yes                | Yes               | No                 | Yes   | Returns aggregate statuses, including explicit `UNCONFIRMED`; no inference of harm.                        |
| `GET /responders/appropriate`          | Yes             | Yes                | Yes               | Yes                | Yes   | Returns verified, available responders using assigned-zone data; never live location.                      |
| `GET /dispatches`                      | No              | Unassigned or own  | No                | No                 | All   | Responder identity is resolved from a verified responder profile.                                          |
| `POST /dispatches/{id}/acknowledge`    | No              | Own or unassigned  | No                | No                 | Yes   | Responder must be verified and on duty; claiming and acknowledgment are atomic and audited.                |
| Alert draft and authorization          | No              | No                 | No                | No                 | Yes   | Authorization only queues simulated delivery in API Core v1.                                               |
| Alert inbox and acknowledgment         | Own             | Own                | Own               | Own                | Own   | Recipient-scoped.                                                                                          |
| Trusted contacts                       | Own             | Own                | Own               | Own                | Own   | Owner-scoped; sensitive fields are encrypted at rest.                                                      |
| `POST /drills` and drill metrics       | No              | No                 | No                | Yes                | Yes   | Drill creation and aggregate metrics only; status-transition APIs are deferred.                            |
| Drill list and training results        | Yes             | Yes                | Yes               | Yes                | Yes   | Training results are attributed to the authenticated user.                                                 |
| Approved map metadata                  | Yes             | Yes                | Yes               | Yes                | Yes   | Approval state is explicit; synthetic geometry is not official.                                            |
| Published instruction packs            | Yes             | Yes                | Yes               | Yes                | Yes   | General access returns only published, unexpired reviewed content.                                         |
| Instruction create/review              | No              | No                 | Yes               | No                 | Yes   | Content is supplied by authorized humans; the API records source/version/hash and never invents guidance.  |
| Instruction publish                    | No              | No                 | No                | No                 | Yes   | Only an approved pack can be published.                                                                    |

## State definitions

- Check-in state: `CONFIRMED_SAFE`, `HELP_REQUESTED`, or computed `UNCONFIRMED`.
- Delivery state: `LOCAL_ONLY`, `QUEUED`, `SENDING`, `SERVER_RECEIVED`, `ACKNOWLEDGED`, or `FAILED`.
- Incident verification state: `REPORTED`, `CORROBORATED`, `VERIFIED`, `RESOLVED`, or `DISMISSED`.
- Dispatch state: `CREATED`, `NOTIFIED`, `ACCEPTED`, `EN_ROUTE`, `ON_SCENE`, `COMPLETED`, `ESCALATED`, `CANCELLED`, or `FAILED`.
- Help-request state: `OPEN`, `ACKNOWLEDGED`, `ASSIGNED`, `RESOLVED`, or `CANCELLED`.
- Instruction approval state: `DRAFT`, `APPROVED`, `REJECTED`, `PUBLISHED`, or `RETIRED`.
- Operating mode: `DEMO`, `DRILL`, `TEST`, or `SIMULATION`; API Core v1 does not make live emergency-service claims.

Canonical enum values, Zod request schemas, and transition maps are exported by `@sahaya/contracts`. Consumers must not duplicate these definitions or infer authorization from UI state.
