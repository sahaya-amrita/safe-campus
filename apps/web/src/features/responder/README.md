# Responder module (Claude Code 2)

Owned paths:

- `apps/web/src/features/responder/` — dashboard, help-request queue/detail, roll-call summary, campus contacts, API adapters
- `apps/web/src/features/incidents/` — hazard review queue, review form, review rules
- `apps/web/src/components/tom/` — Tom help launcher/panel, knowledge base, optional AI adapter

## Mounting in the shared app (`apps/web`)

The shell owns routing, session and layout. Three pieces need wiring: the
dashboard on a route, one `<Tom>` at shell level, and a **navigation adapter**
so Tom can move users between registered screens.

```tsx
import {
  CAMPUS_CONTACTS,
  HttpResponderApi,
  RESPONDER_DESTINATIONS,
  ResponderDashboard,
  canAccessResponderWorkspace,
  destinationForView,
  type ResponderView,
} from "./features/responder";
import { Tom, TourTargetProvider, type TomNavigationAdapter } from "./components/tom";

const responderApi = new HttpResponderApi({ baseUrl: "" }); // cookie session; no tokens stored here

// Route paths are the shell's choice; Tom only ever sees destination ids.
const PATHS: Record<string, string> = {
  "responder.help-requests": "/responder/help-requests",
  "responder.hazard-review": "/responder/hazard-review",
  "responder.roll-call": "/responder/roll-call",
  "responder.contacts": "/responder/contacts",
};

function useTomNavigation(router, session): TomNavigationAdapter {
  return {
    destinations: () => RESPONDER_DESTINATIONS,          // + student destinations, once defined
    current: () => idForPath(router.location.pathname),  // shell helper
    canNavigate: (id) => id in PATHS && canAccessResponderWorkspace(session.role), // the shell's route guard
    navigate: (id) => (router.navigate(PATHS[id]), { ok: true }),
    canGoBack: () => router.canGoBack(),
    back: () => (router.back(), { ok: true }),
  };
}

// Shell layout: ONE provider around the page content and ONE Tom.
<TourTargetProvider>
  <Routes>
    <Route path="/responder/:view" element={<ResponderRoute />} />   {/* view from the URL */}
  </Routes>
  <Tom
    role={session.role}                 // from the authenticated session; picks help content only
    context={currentDestinationId}      // e.g. "responder.hazard-review", "student.check-in"
    mode={appMode}                      // "DEMO" | "DRILL" | "LIVE"
    navigation={tomNavigation}          // typed adapter above; omit to disable navigation
    approvedInstructions={publishedPacks} // APPROVED/PUBLISHED instruction packs only
    contacts={CAMPUS_CONTACTS}          // LIVE shows institution-confirmed contacts only
    messages={tomMessagesFor(language)} // optional; English by default (see TomMessages)
  />
</TourTargetProvider>

function ResponderRoute() {
  const view = useParams().view as ResponderView;      // controlled by the router
  return <ResponderDashboard api={responderApi} mode={appMode} view={view}
            onViewChange={(v) => router.navigate(PATHS[destinationForView(v)])} />;
}
```

### Tom navigation contract (`components/tom/navigation.ts`)

- Tom can only reach ids returned by `destinations()`. `navigateSafely()` rejects
  unregistered ids **before** calling the host, then asks `canNavigate()` (the
  shell's own authorization, never a model), then calls `navigate()` and reports
  exactly what happened (`NOT_REGISTERED`, `NOT_PERMITTED`, `UNAVAILABLE` or
  `FAILED` is shown as "Nothing changed").
- Tom never clicks DOM elements and never opens URLs. The server still
  authorizes every data request (401/403 shows the access notice).
- Back support is optional (`canGoBack` / `back`).
- `createResponderNavigation()` is a ready adapter over plain view state (used by
  the harness); the shell will normally write its own over the router, as above.

### Guided tours (`components/tom/tourTargets.tsx`)

- Highlightable elements opt in with `useTourTarget("stable.id")`. The tour looks
  targets up by id only; there are no CSS selectors. Registered ids:
  `responder.nav`, `responder.summary`, `responder.mode-banner`,
  `responder.status-filter`, `responder.request-list`, `responder.hazard-filter`,
  `responder.rollcall-scope`, `responder.contacts-list`, `tom.launcher`.
- **Shell requirement:** one `<TourTargetProvider>` must wrap both the routed
  content and `<Tom>`. Without it, tours still run but explain that the target
  isn't showing.
- Tour steps are `TOUR_STEP` knowledge-base entries (`tourId`, `targetId`,
  `destination`, `optional`), so the LIVE review rules apply to tours too.
- The tour is non-modal. It has Back, Next, Skip tour, Finish, and Escape from
  anywhere. It restores focus and the starting view when it ends, docks at the
  bottom on phones, and doesn't animate when reduced motion is requested.

### Assistant (`components/tom/assistant.ts`, `assistantClient.ts`)

- **Built-in, deterministic intent registry (always on).** It provides grounded
  app-help explanations, explains the current screen, navigates (only on an
  explicit "take me to…"; otherwise it offers a button), goes back, offers the
  tour, links approved instructions, gives the emergency fallback, refuses
  consequential actions, asks "which one did you mean?", and says "I don't know".
  It is labelled in the UI as a functional prototype.
- **Optional AI assistant server: PROPOSED, not built.** The proposal is in
  [`components/tom/assistant-api/ASSISTANT_API_PROPOSAL.md`](../../components/tom/assistant-api/ASSISTANT_API_PROPOSAL.md),
  with tested reference server code in `REFERENCE_IMPLEMENTATION.md`, for Codex 1
  to adopt.
  - Tom's client (`HttpTomAssistantBackend`) is implemented and disabled until
    the shell passes `assistant={...}`.
  - It sends only `{ question, context: { screen, locale } }` with the
    session's Bearer token, and contains no model keys.
  - It validates the response strictly and keeps a suggested action only if the
    host registered that target.
  - Emergencies, refusals, explicit navigation, back, tours and instruction
    requests are always answered locally and never sent.
  - AI answers are labelled by provider (LLM / MOCK / RULES), show their approved
    references, and are never official instructions.
  - AI is never used in LIVE mode.

### Onboarding and shortcut

- **First-visit welcome:** a small, non-blocking callout with "Take a tour" and
  "Not now". It is shown once per browser: `localStorage`
  `safe-campus.tom.onboarded` is set on either choice or when Tom is opened.
- **`?` key:** opens Tom unless the user is typing in a field, a modifier is
  held, or a tour is running. Users can turn it off in Tom's footer (stored as
  `safe-campus.tom.shortcut-off`). The launcher advertises it with
  `aria-keyshortcuts`. The shell can disable it with `keyboardShortcut={false}`
  if it conflicts with app shortcuts.
- **Minimise:** shrinks Tom to an icon for the session. Clicking the icon or
  pressing `?` restores it.

### Other notes

- The dashboard does not grant access. It renders a "Responder access required"
  notice for any 401/403. The shell should still route to it only for
  responder/admin sessions.
- `<ResponderDashboard>` is a full-height workspace with its own section rail and
  status bar (`min-height: 100dvh`). Give it the full content area of the
  responder route. If the shell adds its own global navigation, raise it with the
  integrator so the two don't stack awkwardly.
- `<Tom>` is fixed bottom-right at `z-index: 40` (tour layers use 41 and 42).
  Shell dialogs and alert banners should sit above it. If the shell has a bottom
  bar, set `--sc-tom-offset-bottom` (for example `64px`).
- Styles read shared tokens when defined (`--color-text`, `--color-surface`,
  `--color-border`, `--color-danger`, `--color-warning`, `--color-info`,
  `--color-success`, `--color-text-muted`) and fall back to local values.
- **Campus contacts** are data in `features/responder/campusDirectory.ts`, apart from
  the UI. Each record has a source, a last-checked date and a verification state
  (`INSTITUTION_CONFIRMED`, `PUBLISHED_ONLINE` or `UNVERIFIED`). None is confirmed
  yet. LIVE mode withholds every unconfirmed contact. The Security Office,
  Medical/Clinic and Ambulance numbers were supplied by the project team, but on
  10 Oct 2026 they were not found on the official contact pages, so their source
  URL is still blank. Only office lines are allowed, and personal mobile numbers
  are rejected by `validateCampusContact`.
- **Tom strings** live in `components/tom/tomMessages.ts` (`TomMessages`, same flat
  typed shape as the student i18n `Messages`). Wiring them into the shared i18n,
  including Tamil, waits for Claude Code 1 to confirm that integration contract.
- In LIVE mode Tom shows only knowledge-base entries (including tour steps) with
  `review.reviewed === true` and an unexpired `review.validUntil` (if set). All
  seeded entries are unreviewed drafts, so a named reviewer must approve them
  before LIVE use. AI adapters default to disabled and are never used in LIVE.
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
npm test            # 159 module tests + 10 harness tests
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
