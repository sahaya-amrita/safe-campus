# SAFE CAMPUS — Shared Coding Agent Rules

## Mission
Build a prototype campus emergency-preparedness and student safety coordination platform. It is a proposed supplement to authorized campus procedures, not a replacement for campus security, the Emergency Response Team, or official emergency services.

## Read first
Before coding, read:
- `docs/architecture.md`
- `docs/api-contracts.md`
- `docs/safety-rules.md`
- Your assigned brief in `docs/tasks/`

## Engineering rules
- Inspect the current repository and existing conventions before making edits.
- Implement only the assigned module and files. Do not redesign the whole project or overwrite another contributor's work.
- Prefer a small, testable end-to-end vertical slice over many unfinished features.
- Use TypeScript strict mode where applicable. Validate untrusted inputs at boundaries.
- Reuse shared contracts. Do not invent competing response shapes, enum values, or duplicate types.
- Add tests for meaningful behaviour, error paths, permissions, offline states, and safety rules.
- Run available tests, type checks, lint, and build. Report their real results accurately.
- Do not add credentials, tokens, production secrets, real student records, or private contact data.
- No real notifications, SMS, email, alert broadcasts, or live campus integrations without explicit approved test configuration.
- No unverified campus routes, exits, buildings, assembly points, emergency contacts, responder identities, or response-time guarantees.
- Do not make fake functionality look live. Label mock, seed, demo, simulated, queued, pending, failed, and confirmed states accurately.
- Do not use model-generated text as the source of official emergency instructions.
- Keep accessibility, reduced-motion support, keyboard operation, and readable status text in scope.

## Module ownership
- Codex 1: `apps/api/`, `packages/contracts/`, `db/migrations/`, `tests/api/`, `docs/api-contracts.md`.
- Claude Code 1: `apps/web/src/features/student/`, `apps/web/src/lib/offline/`, `apps/web/src/i18n/`.
- Claude Code 2: `apps/web/src/features/responder/`, `apps/web/src/features/incidents/`, `apps/web/src/components/tom/`.
- Codex 2: `apps/web/src/features/maps/`, `apps/web/src/features/drills/`, `apps/web/public/demo-map/`.

The app shell, package root configuration, shared router, CI configuration, and shared design tokens are integration-owned. Ask before changing them.

## Completion report
At the end, provide:
1. Summary of what actually works.
2. Files created/changed.
3. Commands run and pass/fail results.
4. Tests not run and why.
5. Contract assumptions and integration dependencies.
6. Known limitations and follow-up work.
7. Suggested PR title.
