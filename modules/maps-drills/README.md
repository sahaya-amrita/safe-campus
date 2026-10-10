# Maps and drills: isolated playback foundation

Owned by Codex 2 on `feat/maps-drills`. This bootstrap contribution is a pure TypeScript drill timeline, not a map UI or an operational emergency system. All fixtures are explicitly synthetic. It contains no campus geometry, routes, contacts, locations, instructions, networking, or dispatch.

## Use and verification

Node 22.18+ or Node 24 can run these files using built-in TypeScript stripping. No package installation is needed. From the repository root:

```powershell
node --test modules/maps-drills/timeline.test.mjs
node --input-type=module -e "import { createDrillTimeline } from './modules/maps-drills/timeline.ts'; import { mockDrillScenarioSource } from './modules/maps-drills/mock-adapter.ts'; console.log(createDrillTimeline(await mockDrillScenarioSource.load())(30000));"
```

The second command should show `dataSource: 'SYNTHETIC'`, progress `0.5`, `playbackComplete: false`, two reached milestones and one upcoming milestone. Sample at `60000` to see completed playback and at `0` to restart. Playback completion makes no claim about people's safety or the success of a drill.

`createDrillTimeline` validates and snapshots a scenario and returns a pure function of elapsed milliseconds. It supports seeking, clamps times beyond the duration, and includes milestones at their exact timestamp. Simultaneous milestones preserve their input order. It never mutates inputs or performs side effects. Consumers control the clock and render labels as text.

## Temporary interfaces and integration decisions

`DrillScenarioSource` is the replacement seam for `mockDrillScenarioSource`. These are module-local temporary types, not a proposed replacement for shared API contracts. The `SYNTHETIC` marker describes data provenance, not an operating mode or safety status. No shared enums are duplicated.

- Backend/shared-contract owner (Codex 1): agree on a drill scenario schema and operating-mode envelope before adding an API adapter. Proposed compatible shape: scenario ID, duration in milliseconds, and ordered milestones with ID, timestamp offset, and display label. Keep simulation content explicitly identified. Authorization and approved-data provenance must be agreed before route integration.
- Student experience owner (Claude Code 1): no dependency or changes in this contribution. Any future student drill view needs agreed routing and clear simulation labelling.
- Responder interface owner (Claude Code 2): can later consume sampled frames for a clearly labelled playback view. Reached milestones must not update incidents, student check-ins, message delivery, or responder assignments.
- Integration owner: establish the shared toolchain, test runner, routing and dependency policy. Proposed defaults remain React/TypeScript/Tailwind, Express/TypeScript, PostgreSQL, typed REST and MapLibre; this module does not install or configure them. Migrate these built-in Node tests to the agreed runner if necessary. TypeScript tooling must support `.ts` import extensions (for example `allowImportingTsExtensions` with `noEmit`).

MapLibre, approved-route visualization, UI accessibility verification, offline persistence, real API integration and operating-mode enforcement are deferred until the relevant shared contracts and approved data exist. The mock source must not be wired into operational workflows. There is no root package manifest, build, type-check or lint setup in this repository yet. Native TypeScript stripping runs code but does not type-check it.

New dependencies: none. No other contributor's files or root configuration are changed.
