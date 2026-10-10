# Incident / notification audit and integration handoff

Audited 2026-10-10 on feat/maps-drills. Guidance is absent from this branch's working tree, so AGENTS.md and docs/{architecture,api-contracts,safety-rules,tasks/04-maps-drills-codex}.md were read from main without checking out or modifying them.

## Actual cause of missing notifications

Before this change, map-view.ts fetched only static campus-data.json; campus-scene.mjs rendered the validated OSM snapshot. drill-view.ts used drill-model.ts's memory-only store. preview.mjs mounted these independently. No incident submission, verification queue, alert generation, recipient subscription, notification transport, API handler or backend receipt existed in the inspected branch. Therefore no alert-delivery pipeline was invoked. This is a missing integration, not a demonstrated API failure, authentication error or transport outage. Baseline: 30 model tests and 16 browser checks passed.

## Implemented scope

An isolated DemoSimulationAdapter now demonstrates report → submit → explicit review → prepared alert → attempted delivery → simulated confirmed/failed → explicit recipient acknowledgment, plus resolution and linked drill responses. It is local page memory. No URL, arbitrary recipient list or LIVE command is accepted. Failure does not populate an inbox. Retrying a command is idempotent; changed payloads under the same request ID are rejected. Recipient acknowledgment requires the selected fictional identity and a confirmed simulated delivery. Resolution cannot skip a pending attempt.

The existing provisional hazard values PENDING_REVIEW, VERIFIED and RESOLVED are reused verbatim in the demo DTO. Reported and Awaiting verification are presentation stages within PENDING_REVIEW; verification time remains separate from lifecycle. No severity enum was supplied, so severity is unavailable. Lowercase prepared/attempted/confirmed/failed are explicitly local simulation stages, not new shared backend enums or actual notification receipts. The shared docs define no alert schema/endpoint; none is invented here.

## Integration owner dependencies

Codex 1 must supply authoritative contracts for incidents, authorized verification, classification if any, zone membership, alert requests, actual delivery receipts and acknowledgments, plus authentication/authorization and an approved test transport configuration. Agree on endpoint names and exact status values before replacing the local adapter. Do not interpret demo role selection as backend authorization, or demo confirmation as external delivery. Student/responder contributors should consume the agreed contracts via their own modules; none were edited here.

Operational navigation additionally needs institution-approved, current geometry/routes and provenance accepted by the existing guarded map model. OSM and public website references cannot satisfy that requirement. Approved emergency instructions, locations and contacts remain unavailable.

## Validation and limits

Commands and actual results are in README.md. No repository package manifest, production shell or lint configuration exists on this branch. Validation covers the isolated preview, strict TypeScript modules, model invariants and browser-emulated interactions; it does not establish production transport, real authentication, physical-device performance or campus safety approval. All records clear on reload. No real notifications or physical actions were triggered. No dependency, shared contract, router, backend or other agent module was changed; no commit/push was made.
