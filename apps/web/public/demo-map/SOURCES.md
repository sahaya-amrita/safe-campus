# Campus data and rendering assets

## Geographic source

- OpenStreetMap campus boundary: https://www.openstreetmap.org/way/128964693
- Exact public OSM API snapshot query: https://api.openstreetmap.org/api/0.6/map.json?bbox=76.8928,10.8973,76.9066,10.9099
- Official contextual campus reference: https://www.amrita.edu/campus/coimbatore/
- Attribution and license: https://www.openstreetmap.org/copyright
- ODbL 1.0 legal text: https://opendatacommons.org/licenses/odbl/1-0/

`campus-data.json` is a derived OpenStreetMap database distributed under **ODbL 1.0**. © OpenStreetMap contributors. It retains original coordinates, way IDs, versions and edit timestamps for the included geometry. The retrieval timestamp and SHA-256 of the raw API response are recorded under `source`. The derived file is itself hashed in `asset-manifest.json`. Attribute OSM and preserve applicable ODbL obligations when redistributing this derived data. The application source code and Three.js have separate licensing.

The official Amrita page confirms the target campus and location; it is not a geometry license, height survey or operational approval. No Google imagery, proprietary map tiles or traced satellite photographs are included.

### Reproducing the extraction

After building the preview (which creates ignored `generated/`), download the exact API URL above to `generated/osm-raw.json`. Run:

```powershell
node apps/web/public/demo-map/prepare-campus-data.mjs
```

This regenerates `campus-data.json` from the current snapshot, so upstream edits may change geometry/counts and require review. Record a new derived-file checksum in `asset-manifest.json` only after reviewing updates. The extractor:

- Retains closed building/boundary/landscape ways with campus-intersecting source vertices.
- Keeps road runs containing only original in-campus vertices. It neither invents connectors nor produces routing instructions.
- Whitelists display tags; excludes editor usernames/UIDs, emails, telephone numbers and contact fields.
- Omits unrelated ways and relation geometries it cannot faithfully assemble, including the larger woodland multipolygon.

All 181 included features are **UNVERIFIED for institutional use**. Source geometry is traceable, not certified. There are no surveyed heights in the snapshot. Three buildings carry OSM level counts; all displayed heights are consequently estimates. Category colors, flat ground, façade details, road widths and individual tree placements are illustrative. The interface explicitly discloses 1.6× vertical exaggeration. Source lawns, pitches and water outlines remain distinguished from decorative trees.

## Three.js

Pinned version: **0.180.0**. Files copied unmodified from the following URLs:

- https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js
- https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.core.js
- https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js
- https://cdn.jsdelivr.net/npm/three@0.180.0/LICENSE

The included `vendor/three/LICENSE` is the MIT license. `asset-manifest.json` records exact local SHA-256 hashes and byte sizes. The preview uses a local import map; OrbitControls and Three.js use the same version. No runtime requests go to the CDN. Three.js and these vendor files are not approved campus data.

Official rendering reference: https://threejs.org/docs/ ; camera control reference: https://threejs.org/docs/pages/OrbitControls.html .

## Validation tooling

Browser QA uses the host's existing Playwright installation and Microsoft Edge. Strict TypeScript validation used TypeScript 5.9.3 from https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz, extracted only to ignored `generated/tooling/`. It is not a runtime dependency or a shared-toolchain installation.

## Official public information register — checked 2026-10-10

| Reference | Supported use | Classification / approval / license |
| --- | --- | --- |
| https://www.amrita.edu/campus/coimbatore/ | Campus identity and general public reference | Official public institutional webpage; not operational geometry approval. No open redistribution license assumed. Linked with a short summary. |
| https://www.amrita.edu/campus/coimbatore/infrastructure/ | Page describes Amrita Dispensary | Official public reference; no verified facility coordinate or current availability inferred. Not an emergency procedure source. No open redistribution license assumed. |
| https://www.amrita.edu/contact/ | Coimbatore general institutional number +91 (422) 2685 000 | Public organization contact, not private staff data and not a verified emergency dispatch number. No operational approval inferred. |

No restricted intranet content or private staff contacts were collected. No official-source geometry was available for operational navigation. The medical facility is intentionally not placed on the map without verified coordinates. Emergency contacts, responder availability, evacuation instructions and approved routes remain unavailable.

Incident building anchors reuse unverified OSM footprints strictly in DEMO. Incident categories, fictional recipients, zones, delivery outcomes, 45 m circles and scripted 15-second timeline increments are authored demonstration data, not observed campus incidents, surveyed zones, real receipts or measured response times. Public references and demonstration content are kept distinct in the interface.
