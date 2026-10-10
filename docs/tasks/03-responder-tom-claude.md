# Task 03 — Responder Dashboard, Hazard Review and Tom (Claude Code 2)

## Mission
Build a responder workspace for authorized people to triage help requests, review hazards and acknowledge actions, plus an unobtrusive in-app guide named Tom.

## Read first
`CLAUDE.md`, `AGENTS.md`, `docs/architecture.md`, `docs/api-contracts.md`, `docs/safety-rules.md`.

## Owned paths
- `apps/web/src/features/responder/`
- `apps/web/src/features/incidents/`
- `apps/web/src/components/tom/`

Do not implement the API, student pages, maps/drills, global router or app shell. Document integration points and request changes from the integrator rather than editing others' files.

## Deliverables in order
1. Inspect existing app patterns and reuse shared components and contracts.
2. Implement a responder dashboard with distinct queue states (open, acknowledged, assigned, resolved/cancelled as supported). Show useful timestamps and prevent ambiguous state transitions.
3. Implement a help-request detail/acknowledgement flow. Use role-protected API operations; the client alone must not grant responder access.
4. Implement a hazard-review queue with pending, verified, rejected, duplicate and resolved statuses if supported by the shared contract. Require an explicit human review action. Report counts are informational and never trigger an official alert.
5. Include roll-call/session summary UI only using available data. Use synthetic demo data only when clearly labelled. Never claim a campus-wide roll call is complete if the data scope is partial.
6. Build Tom as a small, optional launcher/mascot that can open a help panel with contextual hints, guided-tour steps, FAQs and links to approved instructions. Tom should be closed by default, dismissible, keyboard accessible, and non-blocking.
7. Keep a knowledge base of reviewed static guidance and explicit navigation help. An optional AI adapter may explain approved content, but it must be disabled or mocked by default unless the backend integration is configured.
8. Tom must not issue unrestricted emergency instructions, improvise routes/contacts, promise responders are coming, make decisions on the user's behalf, or trigger consequential actions. In LIVE mode, limit it to approved content and navigation guidance. If it does not know, say so and show available verified contacts/procedures only when configured.
9. Make Tom role-aware and context-aware without collecting unnecessary behavioral data. Keep dismissed tips dismissed for the current session or according to the existing preferences pattern. Never trap the user in a tour.
10. Add tests for queue state rendering, authorization failure UI, human-review flow, Tom open/close/dismiss, keyboard access, missing knowledge and AI-disabled behavior.

## Acceptance criteria
- Responder states are visually and semantically distinct.
- Review/acknowledgement is attributable to an authorized action and never faked locally.
- Tom is helpful but never blocks the emergency flow or presents model-generated text as official instruction.
- No unverified location, personal data, official contact or alert is fabricated.
- Components integrate through shared contracts and app patterns.

## Report back
List dashboard views, status transitions, Tom behaviors and safety boundaries, tests run/results, and any app-shell integration instructions.
