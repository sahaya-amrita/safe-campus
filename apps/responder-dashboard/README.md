# TEMPORARY dev-only harness — responder module

**Not a production app.** The canonical application is `apps/web`. This directory
only lets the responder module's tests, typecheck and demo build run until
`apps/web` has its own working test setup. It contains no feature code.

Feature code, integration notes and the provisional contract assumptions are documented in
[`apps/web/src/features/responder/README.md`](../web/src/features/responder/README.md).

```bash
npm ci
npm test            # vitest run (90 module tests + 5 harness tests)
npm run typecheck   # tsc strict
npm run build       # builds a DEMO page backed by MockResponderApi (synthetic data)
npm run dev         # same DEMO page, local dev server (http://localhost:5173)
```

Remove this entire directory once `apps/web` runs these tests itself (steps in
the README linked above).

Harness-only files: `src/HarnessApp.tsx` (mounts the workspace and exactly one
Tom), `src/HarnessApp.test.tsx` (launcher visible and opens; regressions for the
missing-launcher defect), `src/harness.css` (page reset), `src/main.tsx`.
