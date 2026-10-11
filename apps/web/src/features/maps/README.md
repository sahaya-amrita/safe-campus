# Amrita campus 3D explorer — Codex 2

The default map is a genuine Three.js/WebGL scene using an OpenStreetMap snapshot of Amrita Vishwa Vidyapeetham at Ettimadai, Coimbatore. It is a geographically informed, stylized visualisation, **not a surveyed digital twin**. The warning **DEMO MAP — NOT FOR NAVIGATION** is persistent.

The working digital drill preserves its existing state machine: Prepare → Respond → Reflect → Improve, score/debrief, restart, idempotent retry and page-memory-only `LOCAL_ONLY / Not sent` records. No physical drill or real notifications are initiated.

## What works

- Extruded source footprints with shaded walls, roofs, shadows and natural lighting.
- Mapped campus boundary, connected road/path segments, lawns, grounds and water features. Road slabs have depth; their widths and surface styling are illustrative.
- Orbit, wheel/pinch zoom, right-drag/two-finger pan, keyboard/button controls, reset, top-down and angled camera views.
- Raycast building selection, visible highlight, source information, name/OSM-ID search and inferred category filters.
- Responsive directory and immersive scene; 360/390/430/768px browser-emulated layouts; reduced-motion disables camera damping and no automatic rotation is used.
- Explicit loading, empty, malformed-data, permission, fetch-error and missing-WebGL states. Failure does not substitute a generic campus. Source directory remains available when WebGL cannot start.
- GPU resources, controls, resize observers and pending requests are cleaned up on unmount/reload; a context loss reports a recovery action.

## Data and estimates

See `apps/web/public/demo-map/SOURCES.md` for acquisition URLs, licensing, reproducibility and source limitations. The checked-in derived snapshot contains:

| Kind                      | Count |
| ------------------------- | ----: |
| Building footprints       |    99 |
| Named buildings           |    31 |
| Road/path segments        |    61 |
| Green-space polygons      |     7 |
| Sport/playground polygons |    10 |
| Water features            |     3 |
| Campus boundary           |     1 |

All geometry is community-mapped and **institutionally unverified**. Each feature retains its OSM way ID, version and last-edit timestamp. Coordinates are source coordinates; road segments are retained only between original in-campus vertices and are never joined with invented connections. Closed way polygons are supported; general multipolygon relations are not reconstructed.

Only three buildings have `building:levels=3`; none has an explicit height tag. Those three are estimated at 3.2 metres per level. Others use visibly disclosed category-based illustrative heights (5–13 metres). The renderer uses 1.6× vertical exaggeration for legibility. Names come from OSM; unknown names remain “Unnamed building · OSM …”. Categories are inferred from source tags and labelled as such.

Flat terrain, roof/façade styling, estimated road widths and individual tree placements are illustrative. A checkbox removes trees and façade detailing. The landscape polygons themselves come from OSM. No emergency locations, safe routes, responder availability or real student positions are invented. Official public general contact information is sourced separately and is not an emergency contact.

## Dependency and integration choices

No React/Vite shell or package manifest exists on this branch. This revision preserves the existing mountable feature interface and preview; it does not create another application or edit root tooling/routing.

Three.js **0.180.0** and its matching OrbitControls are vendored unmodified inside the owned `public/demo-map/vendor/three/` directory with their MIT license. `asset-manifest.json` records SHA-256 hashes and sizes. Runtime assets are served locally, with no CDN calls at runtime. This is the only added runtime library. The integration owner should eventually replace vendoring with a single agreed `three` package dependency, resolving `three` and `three/addons/controls/OrbitControls.js` through Vite. Do not introduce a second Three version alongside it.

`mountMapViewer(host, { adapter?, onSceneReady?, onSimulationReset?, onStartDrill? })` returns cleanup. A future React shell can mount it in an effect on a dedicated ref and return that cleanup. Import the scoped `maps-drills.css` once. The optional `onSceneReady` hook provides camera/selection controls and diagnostics, never operational actions. Default preview loading fetches `campus-data.json` relative to the document; the React integration should supply an adapter targeting its actual static asset URL.

`CampusAdapter.load(signal): Promise<unknown>` is an isolated DTO seam. `parseCampusData` validates the expected campus bounds, finite coordinates, closed polygons, source/version metadata, feature IDs and explicit DEMO/UNVERIFIED mode. It snapshots the result before rendering. These types are not authoritative backend contracts.

The original `map-model.ts` safety gates are unchanged. Its prior guarded viewer is retained as `verified-map-view.ts` solely for future approved-data integration and regression checks. The new OSM renderer is read-only and **cannot enable operational guidance**, even if someone tries to label a payload approved. Nothing feeds OSM paths into a navigation algorithm.

Codex 1 must agree on map/route and drill schemas, authorization, authoritative geometry and coordinate frames before operational or backend integration. The student and responder contributors can mount the view after shell-owner coordination; their queues, instruction packs, incidents and actions are untouched. Existing provisional shared enum conflicts are not resolved or duplicated here.

## Run

From the repository root, using Node 24:

```powershell
node apps/web/public/demo-map/build.mjs
node apps/web/public/demo-map/serve.mjs 4175
```

Open `http://127.0.0.1:4175/`. Port 4174 remains the default if no argument is supplied. Generated JS, screenshots and temporary tooling are ignored. The build strips TypeScript; type-checking is a separate operation.

```powershell
node --test apps/web/src/features/maps/campus-model.test.mjs apps/web/src/features/maps/map-model.test.mjs apps/web/src/features/maps/simulation-model.test.mjs apps/web/src/features/drills/drill-model.test.mjs modules/maps-drills/timeline.test.mjs
node apps/web/public/demo-map/browser-smoke.mjs <absolute-path-to-playwright/index.mjs>
node apps/web/public/demo-map/workflow-browser.mjs <absolute-path-to-playwright/index.mjs>
tsc -p apps/web/src/features/maps/tsconfig.json
```

Browser QA uses an existing Playwright installation with Microsoft Edge, starts its own temporary loopback server, and closes it. Omit the module-path argument when Playwright resolves normally. The TypeScript configuration checks strict mode and unchecked indexing for the TypeScript modules. The renderer is JavaScript with an explicit declaration boundary, syntax-checked and exercised in browser tests; it is not fully checked as TypeScript.

## Observed validation

- **38 model tests passed:** 8 campus/source, 9 map safety, 8 incident/alert/linked-store, 6 drill, and 7 timeline tests.
- **16 browser checks passed:** real WebGL triangles, raycast selection, pointer orbit, controls, filtering, source panels, mobile/reduced-motion layout, four data failures, cleanup, missing-WebGL directory fallback, preserved operational expiry guard, offline drill completion and retry, no uncaught errors or external/state-changing requests.
- **Strict TypeScript check passed**, using an isolated TypeScript 5.9.3 compiler downloaded under ignored `generated/tooling/`; no shared package files changed.
- **Preview build and renderer syntax check passed.** Node reports an experimental TypeScript-stripping warning.
- Desktop, selection/top-down and mobile screenshots were generated and inspected. Initial framing was revised after visual inspection.
- **Lint not run:** no repository lint configuration or linter is present. No formal accessibility audit, real-device GPU benchmark, production React/Vite build, live backend or institution-approved navigation has been validated.

## Manual verification

1. Open the running preview; confirm 99 footprints, 61 path segments and the persistent warning.
2. Drag to orbit; scroll/pinch to zoom; right-drag/two-finger pan. Try the buttons and keyboard arrows/+/-/Home while the canvas is focused.
3. Switch top-down and back to 3D, then reset. Click a building and inspect its OSM link, source revision and height estimate.
4. Search “Central Library”, try an unknown name, and select residential/dining filters. Hidden buildings must not be raycast-selectable.
5. Toggle illustrative trees/façades. The source footprints and road network remain.
6. Open the data-source disclosure and inspect per-feature provenance. No route button or emergency directions are offered by this viewer.
7. Expand the developer fixture panel and try no data, invalid data, permission and offline errors. Restore the OSM snapshot.
8. Complete the unchanged digital drill offline after loading; inspect debrief, local-only status and restart. Reload discards drill records.

Known limitations: OSM may be incomplete/outdated or contain inaccurate labels; some broad building polygons lack courtyard detail. Heights and elevations are not surveyed. Trees are not an inventory. No first-load offline caching/service worker, persisted drill storage or approved routes are implemented. WebGL2 is required for the scene; a directory/error fallback is provided.

Only owned maps, drills and preview files changed. The drill view accepts optional context text; its state machine and existing tests are preserved. Other agents' modules, shared root configuration and routing were not modified. No commits or pushes performed.

Suggested commit: `feat(maps): add isolated incident and alert exercise to campus explorer`

Suggested PR title: **Add simulated incident-to-alert workflow and linked digital drills to the 3D campus**

## Incident and alert exercise (10 October 2026)

See [AUDIT.md](AUDIT.md) for the actual missing-backend diagnosis, ownership and contract dependencies. The isolated memory adapter supports explicit report submission, reviewer verification, zone-selected alert preparation, delivery attempt, simulated success/failure, retry, separate recipient acknowledgment and resolution. A confirmed fictional inbox message can start the existing four-stage digital drill; each accepted local choice appears in the incident timeline.

Map layers toggle buildings, roads/paths, OSM facility buildings and simulated incidents. Incident category filters affect both the list and overlay; focus frames the mapped building. Amber/pink/green incident markers show pending/verified/resolved **simulation** status. Their 45 m circles are illustrative, not validated hazard areas. Fictional recipient zones are cohorts, not surveyed map polygons or geofencing.

All exercise data is page memory only and clears on campus reload, fixture change or page exit. No API, network write, message transport, authentication or persistence was added. The role selector is a teaching control, not access security. Public campus, infrastructure and general contact references have a separate provenance disclosure. Approved emergency procedures remain unavailable.

`simulation-model.ts` owns only the isolated demo DTO and adapter. `simulation-view.ts` presents the workflow; `linked-drill-store.ts` composes the existing local store. `onStartDrill(adapter, incidentId, recipientId)` supplies context to the shell; `onSimulationReset` lets it discard linked sessions when map data resets. The preview implements both hooks.

The additional `workflow-browser.mjs` runs five complete workflows: desktop 1440×1050 plus 360×800, 390×844, 430×932 and 768×1024. Each covers actual emulated touch gestures and raycast selection, layer/search/category controls, failed/retried delivery, recipient isolation, acknowledgment, all four drill stages, restart, resolution, resize, overflow and absence of external/network write requests. Results are browser emulation, not physical-device validation. DPR is capped at 1.25 for narrow scenes (1.75 otherwise); shadows use 1024 or 2048 pixels. Observed final-scene draw calls vary with camera/viewport; these are diagnostics, not an FPS or real-device performance guarantee.

Final validation: 38 model tests, 16 regression browser checks and 5 complete viewport workflows passed. The final 16-check run targeted the live preview at http://127.0.0.1:4176/. Final strict typecheck, preview build and renderer syntax check passed. Mobile and desktop map/incident screenshots were inspected; in-scene simulation/illustrative-boundary labeling and camera-mode synchronization were refined and retested. At the final focused scene, measured draw calls were 334 (desktop), 142 (360px), 152 (390px), 156 (430px), 142 (768px); camera culling and scene width affect these counts. No FPS guarantee is implied. No repository lint configuration was found.

## Safe route (DEMO)

`safe-route.ts` turns the OSM paths into a walking network and finds the fastest
route to the nearest open ground (or a chosen building) that keeps out of every
known risk area. The app's map (`apps/web/src/app/twin/`) shows it in 2D (SVG,
default, works without WebGL) or 3D (this module's Three.js scene with overlays).

- **Risk areas** come from open incidents (verified and unverified) and active
  alerts, drawn around the mapped footprint linked to each synthetic server
  building. Students can add local "practice hazards" that never leave the device.
- **Paths inside a risk area are excluded**, and a 35 m buffer around it is
  penalised. If the start is inside a risk area, the route leads out of it first.
  If nothing avoids the risk, the app says so and points to staff, security and 112.
- **Open grounds are not designated assembly points**, and every route is labelled
  "DEMO route · not approved". Approved routes need institution-verified geometry
  and route variants (blueprint §11.4); this engine must not be presented as one.
- **Blocked areas:** responders and admins can mark a spot impassable on the map
  (`POST /maps/blocks`, audited). Everyone's routes avoid it until a responder
  clears it.
