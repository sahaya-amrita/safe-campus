# SAFE CAMPUS — Initial Architecture

## Product goal
A safety coordination prototype supporting student status check-ins, a responder help queue, human-reviewed hazard reports, cached approved instructions, verified route display when authoritative geometry exists, and supervised digital drills.

## MVP priorities
1. Student can submit “I'm Safe” or “I Need Help” and see the actual state of the submission.
2. Authorized responder can view/acknowledge requests and run a simple roll call.
3. Student/responder can submit and human-review hazard reports without the report count automatically generating a red/official alert.
4. A small approved instruction pack can be cached for offline viewing; offline submissions are explicitly queued and not represented as delivered.
5. One digital drill scenario demonstrates Prepare → Respond → Reflect → Improve.
6. Map displays only verified geometry for operational navigation. If approved campus data is unavailable, show a visibly labelled demo map that says “NOT FOR NAVIGATION”.

## Architecture
- Web client: React + TypeScript + Vite PWA, responsive layout, accessible status indicators.
- API: Node.js + TypeScript modular monolith; Express is an acceptable initial choice if the repository has not chosen a framework.
- Database: PostgreSQL. Add PostGIS only when spatial queries are actually needed and local development can support it.
- Shared contracts: `packages/contracts/` for request/response schemas, enums, and validation.
- Tests: unit tests for domain logic; API integration tests; UI/component tests for key user flows.
- Integrations: all external messaging/identity/campus systems behind adapters with mock implementations by default.

## System boundaries
The prototype must not claim campus authorization or production deployment. A demo environment uses clearly marked synthetic people, incidents, locations, and drill records. Official campus maps, exits, contacts, approval workflow, identity provider, and emergency escalation rules require authorized inputs before operational use.

## Data flow summary
Student action → client validation → API → authorization and domain validation → persistence → response status → UI status. In offline mode, the local client stores a queued item; when connectivity returns it retries with an idempotency key and changes status only after the server responds.

Responder action → authorized API → audit event → persistence → UI acknowledgement. Hazard reports remain pending review until an authorized reviewer changes their state.

## Delivery sequence
1. Establish shared contracts and a mock-data/demo mode.
2. Implement student check-in and responder queue against the same contract.
3. Add offline queue, hazard review and audit trail.
4. Add one digital drill and map viewer.
5. Add polished visualization only after functionality and safety-state tests pass.
