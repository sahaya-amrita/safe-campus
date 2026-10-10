# Responder module (Claude Code 2)

Owned paths:

- `apps/web/src/features/responder/` — dashboard, help-request queue/detail, roll-call summary, API adapters
- `apps/web/src/features/incidents/` — hazard review queue, review form, review rules
- `apps/web/src/components/tom/` — Tom help launcher/panel, knowledge base, optional AI adapter

## Mounting in the shared app (`apps/web`)

The shell owns routing, session and layout. Suggested wiring:

```tsx
import { HttpResponderApi, ResponderDashboard, type ResponderView } from "./features/responder";
import { Tom } from "./components/tom";

const responderApi = new HttpResponderApi({ baseUrl: "" }); // cookie session; no tokens stored here

function ResponderRoute() {
  const [view, setView] = useState<ResponderView>("help-requests");
  return <ResponderDashboard api={responderApi} onViewChange={setView} />;
  // Tell the shell-level <Tom> the context: `responder.${view}`
}

// Once, at shell level:
<Tom
  role={session.role}                 // from the authenticated session; used only to pick help content
  context={currentTomContext}         // e.g. "responder.hazard-review", "student.check-in"
  mode={appMode}                      // "DEMO" | "DRILL" | "LIVE"
  approvedInstructions={publishedPacks} // APPROVED/PUBLISHED instruction packs only
/>
```

- The dashboard does not grant access. It renders a "Responder access required"
  notice for any 401/403. The shell should still route to it only for
  responder/admin sessions.
- `<Tom>` is a fixed, non-modal launcher (`z-index: 40`). Shell dialogs and alert
  banners should sit above it.
- Styles read shared tokens when defined (`--color-text`, `--color-surface`,
  `--color-border`, `--color-danger`, `--color-warning`, `--color-info`,
  `--color-success`, `--color-text-muted`) and fall back to local values.
- In LIVE mode Tom shows only knowledge-base entries with `review.reviewed === true`.
  All seeded entries in `components/tom/knowledgeBase.ts` are unreviewed drafts, so
  a named reviewer must approve them before LIVE use. The AI adapter defaults to
  disabled and is never used in LIVE mode.
- `MockResponderApi` is for demos/tests only. The dashboard labels it as DEMO MODE.

## PROVISIONAL contract assumptions (need confirmation from Codex 1)

`packages/contracts/` does not exist yet. Local types live in
`features/responder/contracts.ts` and `features/incidents/contracts.ts`. They
mirror the proposal in `docs/api-contracts.md` and must be replaced by re-exports
from the shared package. Nothing below is an established contract.

| # | Assumption | Where |
|---|---|---|
| 1 | List endpoints return `{ items: T[], nextCursor: string \| null }` and accept `status`, `cursor`, `limit` query params (default limit 25). | `api.ts`, `contracts.ts` (`Page<T>`) |
| 2 | `HelpRequest` may include `acknowledgedBy` (server-attributed) and a coarse, responder-only `locationReference`. `priority` is free text/nullable, displayed verbatim. | `responder/contracts.ts` |
| 3 | `POST /responder/help-requests/:id/acknowledge` has no body, takes an `Idempotency-Key` header, returns the updated `HelpRequest`, and returns 409 if not `OPEN`. | `api.ts` |
| 4 | `POST /responder/hazard-reports/:id/review` body is `{ decision: "VERIFIED" \| "REJECTED" \| "DUPLICATE" \| "RESOLVED", note?, duplicateOfId? }`. The server derives the reviewer and returns the updated `HazardReport`. | `incidents/contracts.ts` |
| 5 | `HazardReport` may include `reviewNote` and `duplicateOfId`. | `incidents/contracts.ts` |
| 6 | Review transitions are PENDING_REVIEW → VERIFIED/REJECTED/DUPLICATE, then VERIFIED → RESOLVED. Others are terminal. | `incidents/hazardReview.ts` |
| 7 | Help-request transitions beyond acknowledge (ASSIGNED, RESOLVED, CANCELLED) are documented but **not offered in the UI** because no endpoints exist. | `responder/helpRequests.ts` |
| 8 | **Roll call has no endpoint.** `RollCallSnapshot` is a UI-side proposal only. `HttpResponderApi.getRollCallSummary()` always reports "not available"; only the mock returns (labelled DEMO) data. | `responder/contracts.ts`, `api.ts` |
| 9 | Errors use `{ error: { code, message, requestId? } }`. 401 → unauthenticated, 403 → forbidden, 409 → conflict, 501/`NOT_AVAILABLE` → unavailable. | `responder/apiError.ts` |
| 10 | `Role = STUDENT \| VOLUNTEER \| RESPONDER \| ADMIN`, taken from `docs/safety-rules.md` rule 5. | `responder/contracts.ts` |
| 11 | Instruction-pack links passed to Tom carry `approvalState`, `version`, `sourceLabel`, `language`, `expiresAt?`. Tom shows only `APPROVED`/`PUBLISHED`, unexpired packs with a source and version. | `components/tom/types.ts` |

Migration into the shared `apps/web` scaffold: see [MIGRATION.md](./MIGRATION.md).

## Tests (temporary harness)

Until `apps/web` has its own test setup, run the tests from the dev-only harness:

```bash
cd apps/responder-dashboard
npm ci
npm test            # vitest run over the three owned paths
npm run typecheck   # tsc strict
npm run build       # vite build of the DEMO harness page
```

When `apps/web` has a working Vitest + Testing Library (jsdom) setup:

1. Add the three owned paths to its test `include` (the test files sit next to the code: `*.test.ts(x)`).
2. Make sure its setup imports `@testing-library/jest-dom/vitest` and clears `sessionStorage` after each test, as `apps/responder-dashboard/src/setupTests.ts` does.
3. Delete the entire `apps/responder-dashboard/` directory: `package.json`,
   `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `index.html`,
   `src/main.tsx`, `src/setupTests.ts`, `README.md`, `.gitignore`. No feature
   code lives there.
