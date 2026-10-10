# Responder module: migration checklist for `apps/web`

**Status: done.** The integration commit `d90b160` on `main` added `apps/web` to the workspace and removed `apps/responder-dashboard/`. This checklist is kept as a record only.

## What actually moves

The responder feature code is **already** in its final folders. It does not need to move:

| Path                               | Contents                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/responder/` | Dashboard layout (rail + status bar), help-request queue and detail, roll-call summary, contacts view and `campusDirectory.ts` data, API client and mock, status badge, icons, error notice, `usePagedList` hook, `responder.css`                                                                                      |
| `apps/web/src/features/incidents/` | Hazard review queue and form, review rules, hazard types                                                                                                                                                                                                                                                               |
| `apps/web/src/components/tom/`     | Tom component and avatar, deterministic assistant (`assistant.ts`), typed navigation adapter (`navigation.ts`), tour target registry (`tourTargets.tsx`), `TourRunner`, `tomMessages.ts` (i18n-ready strings), knowledge base and tours, question logic, AI adapters (disabled by default), storage helpers, `tom.css` |

Only the **temporary harness** in `apps/responder-dashboard/` exists because `apps/web` had no test setup. When the branches merge, the three folders above sit next to `features/student/` in the same tree. Nothing is copied or duplicated.

## Inventory

**Components:** `ResponderDashboard`, `HelpRequestQueue`, `HelpRequestDetail`, `RollCallSummary`, `ContactsView`, `StatusBadge`, `RequestErrorNotice`, `Icon` (responder); `HazardReviewQueue`, `HazardReviewForm` (incidents); `Tom`, `TomAvatar` (tom).

**Hooks:** `usePagedList` (responder); `useTourTarget`, `useTourRegistry`, `useRegisteredTarget` (tom). Tom keeps its state inside the component.

**Styles:** `features/responder/responder.css` (also used by incidents) and `components/tom/tom.css`. Both are imported by their components. They use shared tokens when defined (`--color-text`, `--color-surface`, `--color-border`, `--color-text-muted`, `--color-danger`, `--color-warning`, `--color-info`, `--color-success`) and fall back to local values. No global CSS is needed.

**Runtime dependencies:** `react`, `react-dom` only. No router, state library or CSS framework.

**Test dependencies:** `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`. All are **already in the scaffold's `package.json`**, so no new packages are needed.

**Imports:** relative paths only. No `@web/` alias is needed inside the feature code; that alias exists only in the harness's `src/main.tsx`.

## Compatibility trial (done 10 Oct 2026, read-only)

I put the three folders into a throwaway, detached copy of `origin/feat/student-pwa` (`e902492`), outside the repo, and ran the scaffold's own commands. Nothing was committed or pushed, and the copy has been deleted.

| Check                                           | Result                                                                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsc --noEmit` (React 19 types, TypeScript 5.9) | pass, no changes needed                                                                                                                                                               |
| `vitest run` (Vitest 5, jsdom 29), before fix   | 145 / 160 passed: all 15 failures in `Tom.test.tsx`                                                                                                                                   |
| Cause                                           | The scaffold setup doesn't clear `sessionStorage`. My harness setup did, so the "Hide Tom for this session" test leaked into later tests.                                             |
| Fix                                             | `Tom.test.tsx` now clears `sessionStorage` itself in `afterEach`. This is in my own path and follows the scaffold's rule that feature-specific setup belongs in each feature's tests. |
| `vitest run`, after fix                         | **160 / 160 pass** (75 responder + 85 student)                                                                                                                                        |
| `vite build` (Vite 8)                           | pass                                                                                                                                                                                  |

**Re-run after Tom Phase 2 (10 Oct 2026):** the same throwaway trial passed `tsc --noEmit`, **244 / 244 tests** (85 student + 159 module tests), and `vite build`.

**Re-run after the UI upgrade (10 Oct 2026):** the same throwaway trial against `e902492` passed `tsc --noEmit`, **175 / 175 tests** (85 student + 90 module tests; the 5 harness tests aren't part of `apps/web`), and `vite build`.

## Checklist (for when the move is approved)

### A. Merge order

- [ ] 1. The integration owner merges or approves the `apps/web` scaffold (`feat/student-pwa`) first.
- [ ] 2. Rebase `feat/responder-dashboard` onto it. Expect **no file conflicts**: the responder folders and the student/scaffold files don't overlap. `apps/responder-dashboard/` is outside `apps/web`.
- [ ] 3. In `apps/web`, run `npm ci && npm test && npm run typecheck && npm run build`. Expect at least 244 tests (85 student + 159 module tests as of 10 Oct 2026).

### B. Dependencies

- [ ] 4. No `package.json` change is needed. If the integration owner changes the stack, the responder module needs React 18.3+ or 19, plus the test packages listed above.

### C. Test setup

- [ ] 5. No change is needed to `src/test/setup.ts`. The vitest config has no `include`, so it finds `*.test.ts(x)` in the three folders automatically.
- [ ] 6. Confirm the responder tests are picked up: `npx vitest run src/features/responder src/features/incidents src/components/tom` should report 159 tests.

### D. Routing and shell (integration owner)

- [ ] 7. **Responder route,** for example `/responder`, rendering `<ResponderDashboard api={responderApi} onViewChange={...} />`.
  - Show it only to sessions the server reports as `RESPONDER` or `ADMIN`. The dashboard also handles 401/403 itself and never grants access.
  - Use `new HttpResponderApi({ baseUrl })` for real data. Use `new MockResponderApi()` only in an explicit demo mode; the dashboard then shows a DEMO MODE banner.
- [ ] 8. **One `<Tom>` at shell level,** not inside each feature. Props:
  - `role`: from the authenticated session. It only selects help content.
  - `mode`: `"DEMO" | "DRILL" | "LIVE"`.
  - `context`: the current screen. Use `responder.help-requests`, `responder.hazard-review` or `responder.roll-call` (from `onViewChange`) and `student.check-in` for the student screen.
  - `approvedInstructions`: see item 11.
- [ ] 9. **Layering:** Tom is `position: fixed`, bottom-right, `z-index: 40`. Shell dialogs, toasts and alert banners should sit above it. Check that it doesn't cover the student "I Need Help" button on small phones. If it does, set `--sc-tom-offset-bottom` or keep that corner free; the responder views already reserve it (row actions are left-aligned on phones, and the workspace has bottom padding).
- [ ] 9a. **Contacts:** pass `contacts` to both `<ResponderDashboard>` (default `CAMPUS_CONTACTS`) and `<Tom>`. The student module also shows emergency-call text (`emergencyCall`, `campusContactsMissing` in its i18n), so agree with Claude Code 1 on **one** shared contact source instead of two. No number may be marked `INSTITUTION_CONFIRMED` until the institution confirms it.
- [ ] 10. A **session/role provider** is needed for items 7 and 8. Neither the scaffold nor my module includes one.
- [ ] 10a. **Tom navigation adapter over the router** (see README "Tom navigation contract"): map destination ids to paths, use the shell's route guard for `canNavigate`, and make the dashboard's `view` come from the URL (`view` + `onViewChange` props). Student destinations can be added to `destinations()` once Claude Code 1 defines them.
- [ ] 10b. **One `<TourTargetProvider>`** around routed content and `<Tom>`, so tours can highlight targets.
- [ ] 10c. **Assistant backend (optional):** only after Codex 1 adopts the proposal in `components/tom/assistant-api/` (`POST /api/v1/assistant/interpret`). Then construct `HttpTomAssistantBackend({ getAccessToken })` in the shell and pass it to `<Tom assistant>` only in modes the integration owner allows. Never put model keys in the client.

### E. Shared contracts and overlaps

- [ ] 11. **Instruction pack → Tom link mapping.** The student `InstructionPack` type has no `title` or `href`. Tom's `ApprovedInstructionLink` needs both. The shell needs a small adapter, or Codex 1 adds those fields. Tom already filters to `APPROVED`/`PUBLISHED` and unexpired packs, which matches student assumption B4.
- [ ] 12. **`ApiErrorBody.requestId`:** required in the student types, optional in mine. Codex 1 should decide; both modules then use `packages/contracts`.
- [ ] 13. **`Role`:** defined only in `features/responder/contracts.ts`. It should move to `packages/contracts`.
- [ ] 14. **Duplicated helpers** that could later move into a shared `lib/`, with integration owner approval: idempotency-key generation (`crypto.randomUUID`, in both modules) and API error classification. These are not blockers.
- [ ] 15. The 11 provisional API assumptions in `features/responder/README.md` still need Codex 1's confirmation. **Roll call has no agreed endpoint.**

### F. Language

- [ ] 16. The responder and Tom text is **English only**. Tom's UI strings are now in `TomMessages` (`components/tom/tomMessages.ts`), which matches the shape of the student `Messages`. Once Claude Code 1 confirms the i18n contract, either add Tom keys to the shared dictionaries or pass `messages` per language. Knowledge-base entries (tips/FAQs) also need translation. Tamil must be reviewed by a fluent speaker before LIVE use.

### G. Remove the harness (only after A–C pass in `apps/web`)

- [ ] 17. Delete the whole `apps/responder-dashboard/` directory: `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/setupTests.ts`, `README.md`, `.gitignore`. No feature code lives there.
- [ ] 18. Update the "Tests" section of `features/responder/README.md` to point at `apps/web` commands.

### H. Verify after the move

- [ ] 19. Do a manual pass at `npm run dev` in `apps/web` with the responder route and Tom mounted: keyboard-only navigation, Escape closes Tom, dark mode, phone width.
- [ ] 20. Confirm the DEMO MODE banner appears whenever the mock API is in use.
