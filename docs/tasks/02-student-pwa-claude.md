# Task 02 — Student PWA and Offline Experience (Claude Code 1)

## Mission
Build a clean, accessible student-facing safety flow, prioritizing clear check-in and honest online/offline status over a large feature list.

## Read first
`CLAUDE.md`, `AGENTS.md`, `docs/architecture.md`, `docs/api-contracts.md`, `docs/safety-rules.md`.

## Owned paths
- `apps/web/src/features/student/`
- `apps/web/src/lib/offline/`
- `apps/web/src/i18n/`

Do not change API implementation, responder pages, maps/drills, the global router, shared design tokens or root tooling without coordination. If folders or app scaffolding do not exist, inspect the repo and propose the smallest compatible addition.

## Deliverables in order
1. Inspect the current application and identify the current router, state/data patterns, styling system, tests and PWA setup.
2. Implement the primary student actions: “I'm Safe” and “I Need Help”. Make them easy to distinguish, keyboard accessible, mobile friendly, and resistant to accidental repeated submissions.
3. Display the actual submission lifecycle using shared contracts: queued offline, pending, accepted, failed. Explain that server acceptance is not responder acknowledgement.
4. Implement an offline instruction cache for approved packs only. Show pack language, version, last-updated/freshness and expiry where present. Never label sample content as official campus instructions.
5. Queue an offline check-in locally with a unique idempotency key. Show `NOT SENT / QUEUED OFFLINE`; retry only when connectivity returns and update the visible state only after a server response. Handle duplicate retries and app reload.
6. Provide English and Tamil UI copy for the critical student flow. Keep strings in i18n files, avoid hard-coded text in components, and ensure Tamil text renders without layout clipping.
7. Include clear permission-denied, API timeout, stale pack, missing-location and failed submission states. Location is optional and must not be assumed available.
8. Add component/flow tests for online success, offline queue, restored connectivity, retry, failure, accessibility-critical interactions and server-accepted-vs-responder-ack distinction.

## Acceptance criteria
- A student can complete the central flow without reading a long explanation.
- Online and offline status cannot be confused.
- Offline submission never appears as delivered or acknowledged.
- No fabricated responder locations, routes, official instructions or emergency contacts.
- English and Tamil primary flow works on narrow/mobile layouts.
- Tests and build pass, or known blockers are listed precisely.

## Integration
Use `packages/contracts/` and the final `docs/api-contracts.md` types. While the API contract is pending, use a typed mock adapter behind the same interface. Do not invent a second data schema.

## Report back
List pages/components, offline storage and retry behavior, i18n coverage, accessibility choices, test commands/results, and any API contract issues.
