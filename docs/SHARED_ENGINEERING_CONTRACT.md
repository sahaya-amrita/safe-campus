# SAFE CAMPUS shared engineering contract

The repository uses a modular monolith, typed REST contracts, explicit safety-state machines, synthetic demonstration data, and strict ownership boundaries between backend, student PWA, responder dashboard, and maps/drills workstreams.

Canonical safety vocabularies are defined in `packages/contracts/src/enums.ts`. Hazard verification, dispatch, check-in, and message delivery are separate state dimensions. Only authorized server-side roles may verify incidents or authorize alerts. Crowd reports cannot create official facts. No software state may imply offline delivery, continuing student safety, real responder availability, or institution-approved routes.

All live emergency channels, real identities, official contacts, approved geometry, and production operating procedures require institutional authorization and are outside this hackathon backend.
