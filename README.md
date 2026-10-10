# Amrita Sahaya API

Backend and shared contracts for the Amrita Sahaya SAFE CAMPUS hackathon MVP. The service is a Node.js and TypeScript modular monolith using Express, PostgreSQL, Zod, and a database-backed simulated notification outbox.

This repository is demonstration software. It does not contact real emergency responders, send production alerts, provide institution-approved routes, or replace official emergency procedures.

## Repository coordination

This repository coordinates four feature workstreams. Durable briefs live under `docs/tasks/`; `AGENTS.md`, `docs/architecture.md`, `docs/api-contracts.md`, and `docs/safety-rules.md` contain the shared rules. API Core owns `services/api`, `packages/contracts`, backend migrations/tests, and API documentation. Student, responder, and maps/drills contributors should consume the published contracts rather than inventing parallel shapes.

## Prerequisites

- Node.js 24 or a current supported Node.js release
- pnpm 11+
- PostgreSQL 18+ or Docker with Compose

## Setup

```bash
pnpm install
Copy-Item services/api/.env.example services/api/.env
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The verified Windows endpoint is `http://127.0.0.1:3000`. Health information is available at `GET /api/v1/health`.

For the installed native Windows PostgreSQL 18 service, follow `docs/WINDOWS_POSTGRES_SETUP.md`. The native service listens on port 5432; the optional Docker configuration uses host port 55432 to avoid collisions.

Demo credentials created by `pnpm db:seed` are listed in `services/api/.env.example`. They are fictional accounts for local development only.

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
pnpm openapi
```

Automated API tests use an isolated PostgreSQL-compatible in-memory adapter and do not require Docker. Migration and seed verification use the real PostgreSQL instance configured by `DATABASE_URL`.

## Database commands

```bash
pnpm db:migrate
pnpm db:seed
pnpm outbox:once
```

`outbox:once` processes queued messages through a local adapter and records `SERVER_RECEIVED`. It never calls an external notification provider.

## API documentation

- OpenAPI 3.1: `docs/api/openapi.yaml`
- Initial-proposal reconciliation: `docs/API_CONTRACT_RECONCILIATION.md`
- Authorization matrix: `docs/AUTHORIZATION_MATRIX.md`
- Architecture: `docs/architecture.md`
- Safety invariants: `docs/safety-rules.md`
- Contributor handoff: `docs/AGENT_HANDOFF.md`
- Implementation status: `docs/IMPLEMENTATION_STATUS.md`
- Native Windows PostgreSQL setup: `docs/WINDOWS_POSTGRES_SETUP.md`

## Troubleshooting

- If migrations cannot connect, confirm `docker compose ps` reports the database as healthy and verify `DATABASE_URL`.
- The local database uses host port 55432 by default to avoid colliding with a system PostgreSQL service. Set `POSTGRES_PORT` and update both database URLs if that port is occupied.
- Delete no database volumes unless you intentionally want to remove local demonstration data.
