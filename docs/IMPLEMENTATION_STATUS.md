# Backend implementation status

Updated 10 October 2026.

## Complete

- Phase 0 foundation: workspace, Express API, validation, errors, environment checks, PostgreSQL migration, local Docker Compose, tests, lint/type/build scripts.
- Phase 1 contracts: canonical safety enums, request schemas, transition maps, and core entity schemas.
- Phase 2 schema: relational tables, constraints, indexes, audit, idempotency, synthetic seed data.
- Phase 3 demo authentication and server-side RBAC.
- Phase 4 incident reporting, eyewitness reports, deterministic duplicate keys, authorized verification history, evidence metadata.
- Phase 5 idempotent incident/drill check-ins, latest-state query, help queue, and unconfirmed summaries.
- Phase 6 permission-filtered verified responder lookup using assigned zones.
- Phase 7 simulated urgent dispatch and database outbox with acknowledgment.
- Phase 8 zone-targeted test alerts, authorization, inbox, and acknowledgment.
- Phase 9 owner-scoped encrypted trusted-contact records; real notification is intentionally absent.
- Phase 10 drill configuration, check-ins, training result persistence, and aggregate metrics.
- Phase 11 OpenAPI and integration handoff documentation.
- Phase 12 persistent help-request lifecycle with audited, idempotent acknowledgment, assignment, resolution, and cancellation.
- Phase 13 versioned instruction-pack metadata/content with review, approval, publication, source hash, and expiry controls.
- Phase 14 opaque cursor pagination for incident, help-request, dispatch, and instruction-pack operational lists.
- Phase 15 UUID path validation and expanded idempotency for consequential state changes.

## Partial or deferred

- Evidence bytes/private object storage and retention worker.
- WebSocket event streaming.
- Responder assignment/escalation scheduler beyond the persisted state model.
- Alert corrections/all-clear endpoints and notification history for trusted contacts.
- Route graph storage and approved-edge APIs.
- Drill status-transition endpoints, detailed event timeline, corrective-action records, and exports.
- Predictive-output persistence.
- Single-drill detail and drill-event write endpoints.
- Institutional SSO, real providers, official contacts, approved rosters, and approved geometry.

## Verification status

Strict type-check, lint, build, formatting, and OpenAPI validation pass. Twenty-two automated safety/API tests pass, including demo login, profile contracts, responder lookup, student-only check-ins, persistent help-request transitions, zone and assignment authorization, instruction review/publication, opaque pagination, invalid UUID handling, dispatch ownership, and the critical safety workflows. Both migrations are parsed and exercised in lexical order through `pg-mem` for tests.

Native PostgreSQL 18.6 on port 5432 is now validated through the authorized application connection. Both migrations and the fictional DEMO seed were verified in `sahaya` and `sahaya_test`. A repeatable API run against `sahaya_test` verified login/profile, incident and check-in idempotency, the persistent help lifecycle, incident verification, simulated dispatch and alert delivery, instruction review/publication, role restrictions, standard errors, and persisted audit events. The live run identified and corrected two PostgreSQL parameter-inference defects by explicitly casting alert recipient IDs to `uuid` and instruction review decisions to `instruction_pack_approval_state`.
