# Backend integration handoff

## Shared setup

Import request schemas and enums from `@sahaya/contracts`. Use the OpenAPI document for endpoints and error shapes. Authenticate with a bearer token returned by the demo-login route. Every error has `error.code`, `error.message`, and `error.requestId`.

The endpoint-by-role rules and state vocabulary are canonicalized in `docs/AUTHORIZATION_MATRIX.md`.

Verified local API base URL: `http://127.0.0.1:3000/api/v1`. Use the IPv4 address for PowerShell verification on the current Windows host because `localhost` did not connect there. Native Windows PostgreSQL setup is documented in `docs/WINDOWS_POSTGRES_SETUP.md`.

State-changing operations require an `Idempotency-Key` header unless the endpoint is read-only. Reusing the key with the same body returns the original result; reusing it with a different body returns `409 CONFLICT`. Cursor-paginated lists accept `limit` and an opaque `cursor`; send the returned `nextCursor` unchanged.

## Student PWA

- Load the signed-in profile and server-owned roles from `GET /api/v1/users/me`.
- Report incidents with `POST /api/v1/incidents` and retain the client key until a `SERVER_RECEIVED` response arrives.
- Store offline operations as `LOCAL_ONLY`; do not manufacture an API response while offline.
- Submit check-ins through `POST /api/v1/checkins`. A `HELP_REQUESTED` response includes a persistent `helpRequest` with initial state `OPEN`; this does not mean that a responder has seen it. Query the latest server record with `GET /api/v1/checkins/me/latest?incidentId=...`.
- Read only published, unexpired, reviewed instruction content from `GET /api/v1/instruction-packs?language=en`. Retain its version, content hash, source label, publication time, and expiry when caching it.
- Use `GET /api/v1/responders/appropriate?zoneId=...`; a null fallback contact means the institution has not supplied an approved contact.
- Read targeted alerts from `GET /api/v1/alerts/inbox` and acknowledge explicitly.
- Trusted contacts are owner-scoped under `/api/v1/trusted-contacts`.

## Responder dashboard

- Read the role-filtered incident queue from `GET /api/v1/incidents`.
- Review through `POST /api/v1/incidents/{id}/reviews`; transitions are enforced transactionally.
- Read dispatches under `/api/v1/dispatches`; responders receive only unassigned or self-assigned records. A verified on-duty responder may atomically claim an unassigned dispatch by acknowledging it, but cannot acknowledge another responder's assignment.
- Read cursor-paginated assistance work from `GET /api/v1/help-requests`; responder results are limited to the verified responder's assigned zone. Use `/:id/acknowledge`, `/:id/assign`, and `/:id/resolve` for the audited lifecycle. `/checkins/help-requests` is deprecated. Verifiers and admins have an unrestricted read view. Summaries remain available from `/api/v1/incidents/{id}/checkins/summary`.
- Instruction reviewers use `/instruction-packs/review-queue` and `/:id/review`. Only administrators may call `/:id/publish`; the API never generates instruction content.
- Alert creation and authorization require an `ADMIN` token. Authorization creates only simulated delivery records.

Real-time WebSocket delivery is not implemented. Polling is the current compatible integration path.

## Maps and drills

- `GET /api/v1/maps/{buildingId}/approved` returns versioned building/floor/zone metadata and an explicit approval flag. Route graph persistence is not yet implemented.
- Drill CRUD starts at `/api/v1/drills`; student check-ins may reference a drill ID.
- Persist practice results through `POST /api/v1/training/results` and retrieve aggregate drill metrics through `GET /api/v1/drills/{id}/metrics`.
- Treat all returned assumptions and demo geometry as synthetic unless an explicit approval field says otherwise.

## Compatibility policy

Additive fields and endpoints are non-breaking. Removing fields, changing enum meanings, or tightening a previously valid request requires coordination and a versioned API change.

## API Core v1.1 deferred interfaces

- Student PWA: no real institutional SSO; identity remains a demonstration dependency.
- Responder dashboard: no WebSocket stream, evidence-byte retrieval, correction/all-clear workflow, or export endpoint. Poll the documented REST queues for v1.
- Maps/drills: no approved route graph, routing engine, predictive-output persistence, or detailed after-action export. Current APIs provide building/floor/zone metadata, drill configuration, check-ins, training results, and aggregate metrics.
