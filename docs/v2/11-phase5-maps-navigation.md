# 11. Phase 5: maps, safe points and verified routing

Built on branch `feat/phase5-maps` (from `develop-v2` at `e0f69e1`).

**Decisions used (no owner input yet):** no verified campus geometry exists, so the app shows **"Navigation unavailable"** until approved data is entered. The **3D view is kept**, still labelled as an unverified illustration; nothing is deleted.

## What changed

| Area                        | Behaviour                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No more invented routes** | The map no longer computes routes over community-mapped OpenStreetMap paths, and no longer offers "open ground" as a destination. Risk areas and responder-marked blocked spots are still shown.                                                                                                                                                                                |
| **Approved safe points**    | `POST /admin/navigation/safe-points` proposes an assembly point, shelter or exit; `.../review` approves or retires it. Students only ever see APPROVED points.                                                                                                                                                                                                                  |
| **Approved route data**     | `POST /admin/navigation/route-graphs` uploads a walking network (nodes with coordinates, edges, optional step-free flag) as a DRAFT, validated (duplicate ids, missing nodes, coordinates). Approving it retires the previous version.                                                                                                                                          |
| **Two-person rule**         | Whoever proposed a safe point or uploaded route data cannot approve it (`409 SAME_PERSON`). Every step needs a reason and is audited.                                                                                                                                                                                                                                           |
| **Routing**                 | `GET /maps/route` runs **A\*** (straight-line heuristic) over the approved graph from the nearest node to the walker (within 150 m) to the safe point, removing edges that pass through active blocked spots; optional step-free only. Otherwise `409 NAVIGATION_UNAVAILABLE`, `409 NO_ROUTE` or `422 START_OFF_NETWORK`, each shown to the user with "follow staff and signs". |
| **Map UI**                  | "Route to a safe point": navigation status first; when available, choose where you are and an approved safe point, optional step-free; the approved route is drawn with its distance, walking time and data version.                                                                                                                                                            |
| **Admin UI**                | **Campus map data** (upload JSON, versions, approve/retire) and **Safe-point approvals** (propose, approve/retire), both stating the two-person rule.                                                                                                                                                                                                                           |

Migration `007` adds `safe_points` and `route_graphs`.

## Verification performed

| Check                              | Result                                                                                                                                                                                                                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API tests                          | 141 (6 new in `navigation.test.ts`): A\* equals Dijkstra on 200 random graphs; blocked spots, step-free and no-route cases; graph validation; unavailable until both approvals; the proposer cannot approve; students see approved points only; routes avoid responder-marked blocks; off-network starts refused. |
| Web tests                          | 469 (3 new for the admin pages)                                                                                                                                                                                                                                                                                   |
| Live, browser against `dev:memory` | Student map at 390 px: "Navigation unavailable — no verified route data has been approved", no route drawn, risk layer still shown, no overflow.                                                                                                                                                                  |

**Not verified:** with real campus data (none exists), on real devices, or on real PostgreSQL.

## Known limits

- **No indoor or floor-level routing** yet; the graph is outdoor walking paths. Floor plans need institutional drawings.
- **The 3D view** stays an unverified illustration. It can be removed later if the owner decides.
- **Blocked spots** are circles; a route is refused only if it passes within the circle.
