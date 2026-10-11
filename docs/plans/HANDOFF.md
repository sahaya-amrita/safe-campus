# Handoff: continue on another computer (2026-10-11)

## Where the work is

| What                                                                          | Where                                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Phases 1–3 (safe-route map, control room, drills, kill switch, blocked areas) | Already on `main` (`1dd12ed`)                                                                                             |
| Tom live on Groq, working guided tour, incident search/filters, master plan   | Branch `feat/tom-live-and-master-plan`, draft [PR #10](https://github.com/sahaya-amrita/safe-campus/pull/10) (not merged) |
| Plan and milestones M0–M8                                                     | [`master-implementation-plan.md`](./master-implementation-plan.md)                                                        |

[PR #9](https://github.com/sahaya-amrita/safe-campus/pull/9) is already on `main`: close it on GitHub.

## Set up the new computer

Use Node 22+ (24 tested) and pnpm 11; Postgres is needed for local runs.

```bash
git clone https://github.com/sahaya-amrita/safe-campus.git
cd safe-campus
git switch feat/tom-live-and-master-plan
pnpm install
cp services/api/.env.example services/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Secrets are **not** in Git. Fill them in yourself:

- **`services/api/.env`:**
  - `DATABASE_URL` (local Postgres for now).
  - `JWT_SECRET` (32+ random characters).
  - `ASSISTANT_PROVIDER=groq`, `GROQ_MODEL=openai/gpt-oss-20b`.
  - `GROQ_API_KEY`: use a **newly rotated** key. The old one was pasted in chat.
  - `ASSISTANT_ALLOW_DRAFT_CONTENT=true` (DEMO only).
- **`apps/web/.env.local`:**
  - `VITE_API_BASE_URL=http://127.0.0.1:3000`
  - `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (public values from the Supabase dashboard).

Then:

```bash
pnpm db:migrate && pnpm db:seed
pnpm dev            # API on :3000
pnpm dev:web        # web on :5173
pnpm --filter @sahaya/api assistant:smoke   # exits 0 only if Groq really answered
```

## Next steps (from the plan)

1. **M1, Codex 1:** run migrations on Supabase Postgres, add RLS or keep tables unexposed, and create a private `report-evidence` bucket.
   - Needs the Supabase DB connection string and a secret key in `services/api/.env`. Never put them in chat or Git.
2. **M2:** move sign-in to Supabase Auth and add guest access.
   - First enable **anonymous sign-ins** in Supabase (Authentication → Sign In / Providers).
   - Disable `/auth/demo-login` in production. The seeded passwords, including ADMIN, are public.
3. **M3:** report contract v2 (location method, coordinates and accuracy, required floor, category, attachment lifecycle).
4. **Maps (Codex 2):** remove the 3D view and stop drawing computed routes on unverified geometry, as the master prompt requires.
5. Then M4 (fast SOS and guest UI), M5 (responder search and photo evidence), M6 (A*), M7 (descriptive analytics), M8 (deploy and second-device test).

## Not pushed on purpose

- **Local `.env` files** (secrets).
- **Root `package.json` / `package-lock.json` with `@supabase/*`** in the old checkout. They would overwrite the pnpm root; add `@supabase/supabase-js` to `apps/web` with pnpm during M2. `@supabase/ssr` is for Next.js and isn't needed.
- **`.codex/agents/*.toml` and the `.docx` files** in the old checkout: these belong to the project owner.
