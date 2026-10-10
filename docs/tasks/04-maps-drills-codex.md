# Task 04 — Map Viewer, Verified Routes and Digital Drill (Codex 2)

## Mission
Create a trustworthy campus-map experience and a supervised digital drill simulation. Operational guidance must depend on verified source data; visual polish must never hide uncertainty.

## Read first
`AGENTS.md`, `docs/architecture.md`, `docs/api-contracts.md`, `docs/safety-rules.md`.

## Owned paths
- `apps/web/src/features/maps/`
- `apps/web/src/features/drills/`
- `apps/web/public/demo-map/`

Do not change API implementation, student/responder feature modules, root router, or global design tokens without coordination.

## Deliverables in order
1. Inspect existing client setup and check if a map library is already installed. Prefer the simplest working option consistent with the repo. MapLibre GL JS is a candidate if no library exists.
2. Create a map viewer with clear legend, zoom/pan, accessible controls, loading/error states and map-source attribution where required by the source license.
3. Separate map-source metadata from geometry. Each operational feature/route must carry source/provenance, version or updated timestamp, and verification/approval state.
4. Operational route guidance is enabled only when approved route geometry is supplied by an authorized source. If not available, show a demo map with a persistent, prominent “DEMO MAP — NOT FOR NAVIGATION” label and do not suggest directions.
5. No fabricated campus boundaries, buildings, exits, assembly points or routes. Synthetic geometry is allowed only in a demo layer with obvious labels and must never be used by a routing algorithm in operational mode.
6. Add an optional simple 2.5D/3D layer only after the 2D map and trust states work. Three.js is optional, not an MVP blocker. Avoid large assets and keep a no-3D fallback.
7. Create one digital drill scenario with phases Prepare → Respond → Reflect → Improve. The simulation should show clearly labelled fictional events and scoring/debrief; it must not send real notifications, activate alarms or contact emergency services.
8. Store drill event data through the shared contract or typed adapter; do not make the UI rely on undocumented backend fields.
9. Add tests for map-source missing/invalid/unverified states, route disabled in demo mode, visible warning, no data/permission errors, and drill-mode isolation.

## Acceptance criteria
- The viewer always communicates whether data is verified, demo, stale, or unavailable.
- A demo map cannot accidentally appear to be an approved campus navigation map.
- No unverified route guidance is rendered.
- One end-to-end digital drill can be completed and reviewed without triggering live actions.
- 3D visualization is optional and must not delay core safety behavior.

## Report back
List map library, data/provenance structure, demo-vs-operational guard, drill phases, test commands/results, and any approved data needed for a real campus map.
