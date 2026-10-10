# SAFE CAMPUS — Architecture

## Product goal and boundaries

SAFE CAMPUS is a safety-coordination prototype for student check-ins, responder assistance queues, human-reviewed incident reports, cached approved instructions, verified map display, and supervised drills. It must not claim campus authorization or production deployment. Demo data is synthetic; official maps, contacts, responders, instructions, identity, escalation rules, and retention policies require authorized institutional input.

## MVP priorities

1. Students submit safe/help status and see the actual persistence state.
2. Authorized responders view and acknowledge help without implying action before acknowledgment.
3. Reports remain human-reviewed and cannot automatically generate official alerts.
4. Only reviewed, versioned instruction packs are published; offline submissions remain visibly local until received.
5. Drills remain clearly simulated.
6. Unapproved geometry is labelled demonstration-only and cannot enable operational routing.

## Implemented API architecture

The backend is a Node.js and TypeScript modular monolith under `services/api/`. Express provides versioned REST routing, Zod validates shared contracts from `packages/contracts/`, and parameterized `pg` queries provide PostgreSQL persistence. Direct SQL keeps migrations, locking, constraints, idempotency, auditing, and outbox behavior visible. PostGIS is deferred until approved geometry and actual spatial-query requirements exist.

- `packages/contracts`: enums, transitions, Zod request schemas, and reusable entity schemas.
- `services/api/src/routes`: authentication, incidents, check-ins, help requests, responders, dispatches, alerts, instruction packs, trusted contacts, drills, training, and maps.
- `services/api/migrations`: schema, constraints, indexes, and append-only audit storage.
- `services/api/src/outbox.ts`: bounded processor with a local simulated adapter only.
- `docs/api/openapi.yaml`: executable consumer contract.

## Data flow

Requests receive a request ID, are authenticated and validated, then execute parameterized SQL in transactions. Consequential mutations store their idempotent response with the domain write and append audit events. Urgent reports may create a simulated dispatch independently, but the incident remains `REPORTED` until an authorized reviewer changes it.

Offline clients store `LOCAL_ONLY` work and retry with the same idempotency key. Only a server response may change delivery state to `SERVER_RECEIVED`. The outbox uses `FOR UPDATE SKIP LOCKED`, invokes only a local logging adapter, and never claims device delivery.

## Authentication and data

The hackathon uses short-lived JWTs from `POST /api/v1/auth/demo-login`. Passwords use scrypt with unique salts; roles come from PostgreSQL and client-supplied roles never authorize actions. Institutional SSO is deferred.

PostgreSQL stores users/roles, buildings/floors/zones, incidents and evidence metadata, verification history, check-ins, help requests, responders, dispatches, alerts/delivery records, instruction metadata, trusted contacts, drills/training, outbox events, idempotency responses, and audit events. Evidence bytes and long-lived precise location histories are outside this API.
