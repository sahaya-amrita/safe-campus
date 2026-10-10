# Task 01 — Backend, Contracts and Data Model (Codex 1)

## Mission

Own the first coherent backend slice for SAFE CAMPUS and publish the API contract that the other three modules will integrate against.

## Read first

`AGENTS.md`, `docs/architecture.md`, `docs/api-contracts.md`, `docs/safety-rules.md`.

## Owned paths

- `apps/api/`
- `packages/contracts/`
- `db/migrations/`
- `tests/api/`
- `docs/api-contracts.md`

Do not take over student UI, responder UI, map UI, shared router, or visual design. Propose shared configuration changes to the integrator.

## Deliverables in order

1. Inspect the repository and report the existing stack, working commands, and gaps. Preserve a functioning existing foundation.
2. Define shared types and schemas in `packages/contracts/`: check-in state, submission/delivery state, help request state, hazard-review state, instruction-pack metadata, drill mode, API error shape.
3. Update `docs/api-contracts.md` with concrete request/response examples, status meanings, permissions, validation, pagination and error behavior. Publish this early in a small PR or clearly announce the contract commit.
4. Implement a modular Node/TypeScript API consistent with the current repo. If no framework exists, Express is acceptable. Keep business logic separate from route handlers.
5. Add storage and migrations for check-ins, help requests, hazard reports, instruction-pack metadata and audit events. Use PostgreSQL if local dependencies are available; if not, define a clean repository interface and a clearly labelled development adapter rather than pretending persistence exists.
6. Implement endpoints from the API contract, authorization middleware and request validation. Provide seed/demo data only in explicitly labelled development mode.
7. Add idempotency handling for client retries and audit events for consequential responder actions.
8. Add API tests for success, validation failures, unauthorized access, duplicate retries, unknown records, status transitions and error responses.
9. Add run instructions and safe environment-variable examples with no secrets.

## Acceptance criteria

- The API contract is stable enough for UI modules to integrate without inventing their own response shapes.
- Student and responder permissions are enforced at the API, not only hidden in UI.
- `NEED_HELP` creates an actionable help-request state but does not imply that a responder has seen or accepted it.
- Hazard submission stays `PENDING_REVIEW`; crowd report volume alone never issues an official alert.
- Idempotent retry does not create duplicate help/check-in records.
- Tests exercise denied access and key failure paths.
- No fabricated production data, real integrations or claims of deployment.

## Report back

List exact routes, schema/type names, migrations, test commands/results, environment setup, and any open contract decisions blocking the other three contributors.
