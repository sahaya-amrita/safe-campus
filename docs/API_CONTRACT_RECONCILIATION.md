# API Core v1.1 contract reconciliation

This document records how the initial `docs/api-contracts.md` proposal was finalized for API Core v1.1. The finalized contract preserves the proposal's safety requirements while making the tested wire names and endpoints canonical.

## Confirmed vocabulary mappings

| Initial proposal        | API Core v1.1                  | Reason                                                                            |
| ----------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| `SAFE`                  | `CONFIRMED_SAFE`               | Explicitly states that the value is a student report, not a continuing guarantee. |
| `NEED_HELP`             | `HELP_REQUESTED`               | Separates a student's request from responder acknowledgment or assignment.        |
| `QUEUED_OFFLINE`        | `LOCAL_ONLY`                   | A client-only state that the API never returns as server receipt.                 |
| `PENDING`               | `QUEUED` or `SENDING`          | Transport lifecycle is distinct from domain state.                                |
| `ACCEPTED` delivery     | `SERVER_RECEIVED`              | Means persisted by the API, not seen by a responder.                              |
| Hazard `PENDING_REVIEW` | Incident `REPORTED`            | The report remains unverified until an authorized review transition.              |
| Hazard `REJECTED`       | `DISMISSED`                    | Authorized negative review state.                                                 |
| Hazard `DUPLICATE`      | `duplicate_group_key` metadata | Duplicate grouping does not create an official verification state.                |

The implemented help-request lifecycle retains the proposed values unchanged: `OPEN`, `ACKNOWLEDGED`, `ASSIGNED`, `RESOLVED`, and `CANCELLED`.

## Confirmed endpoint mappings

| Initial proposal                                | API Core v1.1                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| `POST /check-ins`                               | `POST /checkins`                                                                        |
| `GET /me/check-ins`                             | `GET /checkins/me/latest` for one incident or drill                                     |
| `GET /responder/help-requests`                  | `GET /help-requests`                                                                    |
| `POST /responder/help-requests/:id/acknowledge` | `POST /help-requests/:id/acknowledge`                                                   |
| `POST /hazard-reports`                          | `POST /incidents`                                                                       |
| `GET /responder/hazard-reports`                 | `GET /incidents` with role scoping                                                      |
| `POST /responder/hazard-reports/:id/review`     | `POST /incidents/:id/reviews`                                                           |
| `GET /instruction-packs`                        | `GET /instruction-packs`                                                                |
| `GET /drills/:id`                               | Drill list and metrics endpoints; a single-drill detail endpoint remains deferred.      |
| `POST /drills/:id/events`                       | Drill events are persisted by the schema but the event-write endpoint remains deferred. |

## Integration-impacting changes

- A `HELP_REQUESTED` check-in response now contains `helpRequest: { id, status: "OPEN" }`.
- Responder clients must use `/help-requests` for cursor pagination and lifecycle operations. `/checkins/help-requests` remains temporarily available but is deprecated.
- Incident, help-request, dispatch, and instruction-pack lists accept opaque `cursor` and bounded `limit` parameters and return `nextCursor`.
- Consequential mutations require `Idempotency-Key`. A retry must reuse the same key and request payload.
- All UUID path parameters are validated before database access and return `400 VALIDATION_ERROR` when malformed.
- Student-facing instruction access returns only `PUBLISHED`, unexpired packs. Draft/rejected/approved metadata is limited to `INCIDENT_VERIFIER` and `ADMIN`; only `ADMIN` may publish.

The OpenAPI document is the executable API Core v1.1 reference. UI modules should import the canonical enums and Zod schemas from `@sahaya/contracts` rather than copying the initial proposal types.
