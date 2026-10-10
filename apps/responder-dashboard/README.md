# TEMPORARY dev-only harness — responder module

**Not a production app.** The canonical application is `apps/web`. This directory
only lets the responder module's tests, typecheck and demo build run until
`apps/web` has its own working test setup. It contains no feature code.

Feature code, integration notes and the provisional contract assumptions are documented in
[`apps/web/src/features/responder/README.md`](../web/src/features/responder/README.md).

```bash
npm ci
npm test            # vitest run (159 module tests + 10 harness tests)
npm run typecheck   # tsc strict
npm run build       # builds a DEMO page backed by MockResponderApi (synthetic data)
npm run dev         # same DEMO page, local dev server (http://localhost:5173)
```

Remove this entire directory once `apps/web` runs these tests itself (steps in
the README linked above).

Harness-only files:
- `src/HarnessApp.tsx` mounts the workspace and exactly one Tom. It wraps them in
  a `TourTargetProvider` and wires `createResponderNavigation` to view state with
  a simple back stack, standing in for the router.
- `src/HarnessApp.test.tsx` checks the launcher, onboarding, question-driven
  navigation and back, refusal, the role guard, and the full workspace tour.
- `src/harness.css` is a page reset. `src/main.tsx` is the entry point.

To see the first-visit welcome again, clear the site's local storage, or run
`localStorage.removeItem("safe-campus.tom.onboarded")` in the browser console.

## Tom's AI assistant (needs the API)

`npm run dev` talks to the SAFE CAMPUS API at `http://localhost:3000` by default.
For a build, set `VITE_API_BASE_URL` (the API's public URL or bare host). It is
bundled into the page, so **never put a key or secret in any `VITE_*` variable**.

Use the "Tom AI" chip (bottom right) to sign in with a seeded **fictional**
demo account (listed in `services/api/.env.example` on the API branch). The
access token is kept in memory only. Without signing in, Tom uses built-in help
and never calls the API. Server setup, the Groq key and deployment are covered in
`services/api/src/assistant/README.md` on `feat/tom-assistant-api`.
