# apps/web — temporary bootstrap scaffold

**Status:** superseded on 11 Oct 2026 — `src/main.tsx` now mounts the integrated app shell in `src/app`, and the app is part of the pnpm workspace. The notes below are kept for history.

**Original status:** temporary. **Owner:** the integration owner. Claude Code 1 created it so the student PWA could run in a browser before the real application shell existed. Creating it does **not** transfer ownership.

## Placeholder files (review or replace)

| File | Why it exists | Expected replacement |
| --- | --- | --- |
| `package.json`, `package-lock.json` | Dependencies to run React + Vite + Vitest, the PWA plugin, fonts and zod. | The integration owner's package / workspace setup. |
| `tsconfig.json` | Strict TS. `paths` map `@sahaya/contracts` to its source, because pnpm is not used here. | The shared TS config / workspace references. |
| `vite.config.ts` | React plugin, Vitest, the `@sahaya/contracts` source alias, and **vite-plugin-pwa** (manifest + Workbox service worker). | The shared Vite config. |
| `index.html` | Entry document: Amrita Sahaya title, theme colour, icons, `viewport-fit=cover` for phone notches. | The real shell document. |
| `src/main.tsx` | Mounts **one** feature and registers the service worker. Announces waiting updates via the `sahaya:update-ready` event. | The real app shell and router. |
| `src/brand/` | Shared Amrita Sahaya tokens and the emblem, usable by every module. | A shared brand / design-token package. |
| `public/brand/` | PWA and home-screen icons (192, 512, maskable 512, apple-touch 180, favicon 64). | Icons generated from vector masters. |
| `src/test/setup.ts` | Generic jest-dom matchers and RTL cleanup. | The shared test setup. |
| `.gitignore` | Keeps `node_modules` and `dist` out of git. | Root ignore rules. |

## PWA behaviour (as configured)

- **Precache:** every build asset, including each script's woff2 font (≈50 files, ≈1.3 MB).
- **Navigations:** offline navigations fall back to `/index.html`. `/api/` is never cached and never served from cache.
- **Updates:** `registerType: 'prompt'`. A new version waits until the user taps "Reload", so it never interrupts a help request. `cleanupOutdatedCaches` removes old precaches.
- **Manifest:** name, short name, portrait orientation, ivory background, navy theme, and `any` + `maskable` icons.

## Brand assets: provenance and quality

- **Source:** "Amrita Sahaya Brand Identity Board.png", a 1536×1024 raster.
- **Extraction:** the primary emblem (≈385×444 px) was cut out with an alpha matte that removes the ivory background.
- **Icons:** every icon size is a downscale of the emblem placed on ivory.
- **Limitations:**
  - There's no vector source.
  - The edges show a faint light fringe on very dark backgrounds, so the emblem is always placed on an ivory tile.
  - The board's rendered swatches differ slightly from its stated hex values; the UI uses the stated values.
- **Request:** vector (SVG) or transparent high-resolution masters of the emblem, lockup and app icon.
- **Approval:** institutional approval of the "Amrita" name and identity is **not** confirmed.

## Commands

```bash
cd apps/web
npm install
npm run dev        # http://localhost:5173 (no service worker in dev)
npm test
npm run typecheck
npm run build && npm run preview   # http://localhost:4173 with service worker
```

Service workers and geolocation need a **secure context**. `http://localhost` qualifies, but `http://<LAN-IP>` does not.
- **Android:** `adb reverse tcp:4173 tcp:4173`, then open `http://localhost:4173` on the phone.
- **iPhone:** real HTTPS is needed, for example `mkcert` with its root CA installed on the device.
