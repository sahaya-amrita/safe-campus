# 04. Branch integration

## Commands

```bash
# Done by the previous agent. The reflog shows the clone, the switch from
# main to develop-v2 and the fast-forward; the remote commands are inferred
# from the resulting configuration (upstream push URL = DISABLED_READ_ONLY).
git clone https://github.com/sahaya-amrita/safe-campus.git amrita-sahaya-v2
git remote rename origin upstream
git remote add origin https://github.com/tmiruna3-rgb/amrita-sahaya-v2.git
git remote set-url --push upstream DISABLED_READ_ONLY
git switch -c develop-v2 upstream/develop
git merge --ff-only upstream/feat/safe-map-phase1

# Phase 1 (this work):
git fetch upstream          # brought main to 1dd12ed and two new branches
git merge --ff-only upstream/feat/tom-live-and-master-plan
```

`develop-v2` moved by **fast-forward only**: no merge commits, no rewritten history, no conflicts. `upstream/feat/tom-live-and-master-plan` (draft PR #10 upstream) sits linearly on top of upstream `main` (`1dd12ed`), so one fast-forward brought in everything.

## Upstream branches

| Branch                          | Contained in `develop-v2` | Commits missing | Tip                                                               |
| ------------------------------- | ------------------------- | --------------- | ----------------------------------------------------------------- |
| `main`                          | Yes                       | 0               | `1dd12ed` control room, drill console, kill switch, blocked areas |
| `develop`                       | Yes                       | 0               | `971c74a` (behind `main`; upstream PRs target `main`)             |
| `feat/student-pwa`              | Yes                       | 0               | `3a817c5` Amrita Sahaya student PWA (GPS, photos, offline)        |
| `feat/responder-dashboard`      | Yes                       | 0               | `dccc970`                                                         |
| `feat/maps-drills`              | Yes                       | 0               | `a275563` 3D explorer and simulated drill workflow                |
| `feat/tom-assistant-api`        | Yes                       | 0               | `cea02ba`                                                         |
| `feat/api-core`                 | Yes                       | 0               | `c2b4a65`                                                         |
| `feat/final-sahaya-integration` | Yes                       | 0               | `d90b160` unified role-aware app                                  |
| `feat/safe-map-phase1`          | Yes                       | 0               | `c7269c3`                                                         |
| `feat/control-room-drills`      | Yes                       | 0               | `1dd12ed` (same as `main`)                                        |
| `feat/tom-live-and-master-plan` | Yes                       | 0               | `10c65be` Tom on Groq, guided tour, incident search, master plan  |
| `docs/agent-task-files`         | Yes                       | 0               | `0b206dc`                                                         |

No branch named in the brief is missing upstream.

## How the earlier branches were consolidated

The upstream integration (`d90b160`, "integrate Amrita Sahaya into one role-aware app") had already merged student, responder, maps and Tom into `apps/web/src/app/`. Phase 1 therefore **did not copy branches together again**. It:

1. **Fast-forwarded** to the newest upstream work, including Tom live, the guided tour, incident search and the master plan.
2. **Re-routed** the existing screens into the `/auth`, `/student`, `/responder`, `/admin`, `/help` and `/legal` tree, with redirects from the old paths.
3. **Added** the admin console. It reuses the existing staff views and adds no new business logic.
4. **Re-themed** the app onto the blue-and-white design tokens, without changing feature logic.
5. **Fixed** a Tom tour focus bug and a racy test.

Modules superseded by the integration are listed as "implemented but disconnected" in [03](./03-feature-inventory.md). They are **kept, not deleted**, because their tests still run and parts may be reused (the older responder harness, `features/incidents`, the maps explorer and simulation views).

## Decisions deferred to the user

- **Push:** `git push -u origin develop-v2` has not been run and needs approval.
- **`main` in the new repository:** never pushed to or merged.
- **Formatting:** the 88 pre-existing Prettier differences are not mass-reformatted. Doing so would bury real changes; it should be a separate commit if wanted.
