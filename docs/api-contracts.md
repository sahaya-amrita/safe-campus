# SAFE CAMPUS — API Core v1.1 Contracts

This document finalizes the initial proposal for the verified API under `services/api/`. `docs/api/openapi.yaml` is the executable endpoint reference and `@sahaya/contracts` is the source of reusable TypeScript/Zod definitions.

## Common rules

- Base URL: `http://127.0.0.1:3000/api/v1` for the verified Windows development host.
- JSON requests and responses; deployed environments must use HTTPS.
- Authenticate with `Authorization: Bearer <accessToken>` from `POST /auth/demo-login`.
- Consequential mutations require `Idempotency-Key`. Reusing a key with the same request returns the stored response; changing the request returns `409 CONFLICT`.
- Timestamps are ISO-8601 UTC. UUID path parameters are validated before database access.
- Errors use `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`.
- Lists use bounded `limit` and opaque `cursor`, returning `items` and `nextCursor`. Clients must not decode cursors.
- No report count, evidence count, or model output verifies an incident or authorizes an alert.

## Canonical states

- `CheckInStatus`: `CONFIRMED_SAFE | HELP_REQUESTED`
- Assistance: `OPEN | ACKNOWLEDGED | ASSIGNED | RESOLVED | CANCELLED`
- Incident verification: `REPORTED | CORROBORATED | VERIFIED | RESOLVED | DISMISSED`
- Delivery: `LOCAL_ONLY | QUEUED | SENDING | SERVER_RECEIVED | ACKNOWLEDGED | FAILED`
- Instruction approval: `DRAFT | APPROVED | REJECTED | PUBLISHED | RETIRED`
- Mode: `DEMO | DRILL | TEST | SIMULATION`

Provisional names are not wire aliases: `SAFE → CONFIRMED_SAFE`, `NEED_HELP → HELP_REQUESTED`, hazard `PENDING_REVIEW → REPORTED`, `REJECTED → DISMISSED`, and offline `QUEUED_OFFLINE → LOCAL_ONLY`. Consumers must update rather than send older values.

## Authentication and profile

`POST /auth/demo-login`

```json
{ "email": "student.demo@example.invalid", "password": "<fictional demo password>" }
```

Returns an access token and server-owned identity/roles. `GET /users/me` returns the authenticated profile. Client-supplied roles never authorize an action.

## Incident reporting and review

`POST /incidents` accepts `type`, `description`, `priority`, optional building/floor/zone IDs, optional occurrence time, and validated evidence metadata.

```json
{
  "type": "SMOKE_DEMO",
  "description": "Fictional demonstration report",
  "priority": "HIGH",
  "zoneId": "00000000-0000-4000-8000-000000000001",
  "evidence": []
}
```

The response contains `verificationStatus: "REPORTED"`, `deliveryStatus: "SERVER_RECEIVED"`, and an optional simulated dispatch for high/critical priority. `GET /incidents` is cursor-paginated and role-scoped; students see only their records. `POST /incidents/{id}/reviews` requires `INCIDENT_VERIFIER` or `ADMIN` and records an audit event. Eyewitness volume never auto-verifies an incident.

## Check-ins and assistance

`POST /checkins` requires exactly one `incidentId` or `drillId`, a client timestamp, and UUID `clientActionId`.

```json
{
  "incidentId": "00000000-0000-4000-8000-000000000001",
  "status": "HELP_REQUESTED",
  "helpDetails": "Fictional integration request",
  "clientCreatedAt": "2026-10-10T12:00:00.000Z",
  "clientActionId": "00000000-0000-4000-8000-000000000002"
}
```

A help check-in transactionally returns `helpRequest: { "id": "...", "status": "OPEN" }`. This means persisted, not seen or accepted. Students query `GET /checkins/me/latest?incidentId=...`.

Authorized responders use cursor-paginated `GET /help-requests` and:

- `POST /help-requests/{id}/acknowledge`
- `POST /help-requests/{id}/assign`
- `POST /help-requests/{id}/resolve`

Students may cancel only their eligible request. Responder access is verified, on-duty, and zone/assignment scoped. Invalid transitions return `400`; inaccessible operations return `403` without exposing private records.

## Dispatches and alerts

`GET /dispatches` is available to responders/admins. A verified responder may acknowledge a `NOTIFIED` unassigned or self-assigned dispatch through `POST /dispatches/{id}/acknowledge`. Dispatch and notifications remain simulated.

Only `ADMIN` may create `POST /alerts` or authorize `POST /alerts/{id}/authorize`. Authorization creates zone-scoped delivery records and a simulated outbox event. Recipients use `GET /alerts/inbox` and `POST /alerts/{id}/acknowledge`.

## Instruction packs

Reviewers/admins create versioned drafts through `POST /instruction-packs`; reviewers decide with `POST /instruction-packs/{id}/review`; only admins publish through `POST /instruction-packs/{id}/publish`. Student reads return only `PUBLISHED`, unexpired content. Every pack records version, language, content hash, source label, and review/publication metadata. The API never generates official instructions.

## Maps, drills, and responder lookup

- `GET /responders/appropriate?zoneId=...` returns verified, available responders using coarse assigned-zone data.
- `GET /maps/{buildingId}/approved` returns versioned geometry metadata and disables routing when unapproved.
- Drill APIs support authorized configuration, aggregate metrics, training results, and check-ins. Real alarms and notifications are forbidden.

## Validation and errors

Representative statuses are `200/201` success, `400 VALIDATION_ERROR` or invalid transition, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, and `409 CONFLICT` for idempotency misuse or uniqueness conflicts. Internal SQL, tokens, credentials, and private records are never returned.
