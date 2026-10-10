# SAFE CAMPUS — Shared Coding Agent Rules

## Mission

Build a prototype campus emergency-preparedness and student safety coordination platform. It supplements authorized campus procedures; it does not replace campus security, the Emergency Response Team, or official emergency services.

## Read first

- `docs/architecture.md`
- `docs/api-contracts.md`
- `docs/safety-rules.md`
- The assigned brief in `docs/tasks/`

## Engineering rules

- Inspect existing conventions before editing and preserve working implementations.
- Implement only the assigned module. Do not overwrite another contributor's work.
- Prefer small, testable vertical slices. Use TypeScript strict mode and validate untrusted inputs.
- Reuse shared contracts; do not invent competing shapes, states, or duplicate types.
- Test meaningful behavior, failures, permissions, offline states, and safety rules.
- Run and accurately report tests, type checks, lint, and builds.
- Never add credentials, production secrets, real student records, or private contact data.
- Never send real notifications or use live campus integrations without explicit approved configuration.
- Never invent campus routes, exits, buildings, contacts, responders, instructions, or guarantees.
- Label demo, simulated, queued, pending, failed, and confirmed states honestly.
- Do not use model-generated content as official emergency instructions.
- Keep accessibility, reduced motion, keyboard use, and readable status text in scope.

## Module ownership

- Codex 1: API, `packages/contracts/`, migrations, API tests, and `docs/api-contracts.md`.
- Claude Code 1: student PWA and offline experience.
- Claude Code 2: responder dashboard, incident review, and Tom guide.
- Codex 2: maps, verified-route rendering, and digital drills.

The app shell, package root, shared router, CI, and design tokens are integration-owned.

## API Core v1.1 integration decision

The verified backend remains under `services/api/` with migrations under `services/api/migrations/`. The older `apps/api/` and `db/migrations/` paths in the initial task pack are superseded for v1.1; do not restructure the tested backend solely to match those provisional paths. Backend changes must update Zod contracts, OpenAPI, migrations when needed, and tests together.

Canonical API states are defined by `@sahaya/contracts` and `docs/api/openapi.yaml`. In particular, use `CONFIRMED_SAFE`, `HELP_REQUESTED`, and incident `REPORTED`; do not silently revert to the provisional `SAFE`, `NEED_HELP`, or `PENDING_REVIEW` names.

## Completion report

Report what works, changed files, actual command results, unrun tests, assumptions, dependencies, limitations, and a suggested PR title.
