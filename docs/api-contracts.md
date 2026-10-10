# SAFE CAMPUS — Shared API Contracts (Initial Proposal)

Codex 1 owns the authoritative implementation and updates this document in the first backend PR. Other contributors should treat the following as the provisional contract and flag proposed changes before coding around them.

## Common rules
- JSON over HTTPS in a deployed environment.
- Validate all inputs on the server.
- Use ISO-8601 UTC timestamps in API payloads; display local time in the UI.
- Every state-changing client submission supports an `Idempotency-Key` header or equivalent request ID to avoid duplicate records on retry.
- Server response distinguishes accepted-for-processing from completed/delivered.
- API errors use `{ "error": { "code": "...", "message": "...", "requestId": "..." } }` without leaking internal errors or private records.
- Pagination should be cursor-based or consistently documented. Do not fetch every record for a dashboard.

## Core domain types

### Check-in
`CheckInStatus = "SAFE" | "NEED_HELP"`

Suggested fields: `id`, `status`, `createdAt`, `updatedAt`, `deliveryState`, `locationReference?`, `note?`.

`deliveryState = "QUEUED_OFFLINE" | "PENDING" | "ACCEPTED" | "FAILED"` for client-visible submission lifecycle. `ACCEPTED` means the server accepted and persisted the request, not that a responder has seen it. Responder acknowledgement is a separate field/event.

### Help request
Suggested fields: `id`, `createdAt`, `status`, `priority`, `acknowledgedAt?`, `assignedResponderId?`, `lastUpdatedAt`.

`status = "OPEN" | "ACKNOWLEDGED" | "ASSIGNED" | "RESOLVED" | "CANCELLED"`.

Only authorized responders may view or change responder-side status. Do not expose a student's precise location to all students.

### Hazard report
Suggested fields: `id`, `category`, `description`, `createdAt`, `status`, `locationReference?`, `reviewedBy?`, `reviewedAt?`.

`status = "PENDING_REVIEW" | "VERIFIED" | "REJECTED" | "DUPLICATE" | "RESOLVED"`.

Submission does not itself issue an official alert. A verified report and an authorized campus notice are separate entities and permissions.

### Instruction pack
Suggested fields: `id`, `version`, `language`, `publishedAt`, `expiresAt?`, `contentHash`, `sourceLabel`, `approvalState`.

Only packs with an approved/published state can be presented as official instructions. Cached content must show its version and expiry/freshness state.

### Drill session
Suggested fields: `id`, `scenarioId`, `mode`, `startedAt`, `endedAt?`, `phase`, `resultsSummary?`.

`mode = "DEMO" | "DRILL"`. No drill action may trigger real-world notifications or alarms unless a separately approved integration is explicitly configured and tested.

## Suggested endpoints
- `POST /api/v1/check-ins`
- `GET /api/v1/me/check-ins?limit=...`
- `GET /api/v1/responder/help-requests?status=OPEN&cursor=...`
- `POST /api/v1/responder/help-requests/:id/acknowledge`
- `POST /api/v1/hazard-reports`
- `GET /api/v1/responder/hazard-reports?status=PENDING_REVIEW&cursor=...`
- `POST /api/v1/responder/hazard-reports/:id/review`
- `GET /api/v1/instruction-packs?language=en`
- `GET /api/v1/drills/:id`
- `POST /api/v1/drills/:id/events`

These are proposals until Codex 1 confirms the request/response schemas, authorization, validation and error cases. Document concrete schemas and example payloads before merging the API contract PR.
