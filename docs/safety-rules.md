# SAFE CAMPUS — Non-Negotiable Safety Rules

1. **Honest states:** never display sent, delivered, seen, or responder-coming claims without the corresponding evidence. Offline work remains `LOCAL_ONLY` until the server confirms receipt.
2. **No invented operational data:** never invent emergency contacts, buildings, exits, assembly areas, routes, responder locations, official instructions, or guarantees.
3. **Route provenance:** operational geometry requires an authorized source and recorded version. Otherwise label the map `NOT FOR NAVIGATION` and disable guidance.
4. **Human verification:** reports and report volume may support review but never independently trigger an official alert.
5. **Permission boundaries:** role-scope sensitive records. Never expose all students' locations or contact details.
6. **Data minimization:** collect only what the flow needs. Do not use fingerprints as identity or duplicate-report proof.
7. **Approved instructions:** present instructions as official only with recorded source and approval. AI must not invent emergency advice.
8. **Drill mode:** simulations must not contact emergency services, send real messages, or activate alarms by default.
9. **Communication limitations:** do not promise SMS or peer delivery without a tested path. Retries must be idempotent and show pending/failure states.
10. **Privacy and audit:** audit consequential actions without logging secrets or unnecessary personal data.
11. **Safe fallbacks:** expose failures, denials, stale maps, and expired instructions, and refer users to verified procedures.
12. **No authorization claim:** the system remains a prototype until formally approved.

## Backend enforcement

- Incidents begin `REPORTED`; only `INCIDENT_VERIFIER` or `ADMIN` may review them.
- `CONFIRMED_SAFE`, `HELP_REQUESTED`, and `UNCONFIRMED` are distinct. `HELP_REQUESTED` creates an `OPEN` request but does not imply acknowledgment.
- `HIGH` and `CRITICAL` reports may create a simulated dispatch without changing verification.
- Delivery states `LOCAL_ONLY`, `QUEUED`, `SENDING`, `SERVER_RECEIVED`, and `ACKNOWLEDGED` are not interchangeable.
- Only `ADMIN` may create and authorize zone alerts; the configured adapter remains simulated.
- Students read only their incidents and published, unexpired instruction packs.
- Responder results are zone/assignment scoped and expose no live GPS or private phone numbers.
- Trusted-contact values are encrypted at rest and omitted from list responses.
