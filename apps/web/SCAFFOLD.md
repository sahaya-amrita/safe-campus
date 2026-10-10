# apps/web — temporary bootstrap scaffold

**Status:** temporary. **Owner:** the integration owner. Claude Code 1 created it so the student PWA could run in a browser before the real application shell existed. Creating it does **not** transfer ownership.

## Placeholder files (review or replace)

| File | Why it exists | Expected replacement |
| --- | --- | --- |
| `package.json`, `package-lock.json` | Minimum dependencies to run React + Vite + Vitest. | The integration owner's package / workspace setup. |
| `tsconfig.json` | Strict TypeScript for `src/`. | The shared TS config. |
| `vite.config.ts` | React plugin and the Vitest jsdom environment. | The shared Vite config, plus a PWA plugin or service worker. |
| `index.html` | Vite entry document. | The real shell document, with manifest, icons and theme. |
| `src/main.tsx` | Mounts **one** feature directly. There is no router, layout or providers. | The real app shell and router. |
| `src/test/setup.ts` | Generic jest-dom matchers and RTL cleanup. | The shared test setup. |
| `.gitignore` | Keeps `node_modules` and `dist` out of git; the root `.gitignore` only lists `.DS_Store`. | Root ignore rules. |
| `SCAFFOLD.md` | This file. | Delete it when the scaffold is replaced. |

Deliberately **not** included:
- a router
- an app shell or layout
- global CSS or design tokens
- shared providers
- a PWA manifest or service worker
- lint config
- root or workspace files

## Commands

```bash
cd apps/web
npm install
npm run dev        # http://localhost:5173
npm test
npm run typecheck
npm run build
```
