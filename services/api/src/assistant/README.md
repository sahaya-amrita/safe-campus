# Tom assistant API (`services/api/src/assistant`)

Tom is SAFE CAMPUS's in-app guide. This module is the server side of its AI assistant. It runs inside the existing API and reuses its authentication (`authenticate` + JWT), error shape, logger and database.

- **Tom-specific code:** owned by Claude Code 2 (Tom).
- **API host, auth, DB, core config:** owned by Codex 1.

## Endpoints

| Method | Path                          | Auth                 | Purpose                                                                                    |
| ------ | ----------------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| `GET`  | `/api/v1/assistant/health`    | public               | `{ status, provider, model, modelCheck }`. No secrets. Use it as the hosting health check. |
| `POST` | `/api/v1/assistant/interpret` | Bearer JWT, any role | Ask Tom a question                                                                         |

**Request** (strict: any other field is a 400; roles come only from the token):

```json
{
  "question": "Where can I review reported hazards?",
  "context": { "screen": "responder.help-requests", "locale": "en" },
  "history": [
    { "role": "user", "content": "…" },
    { "role": "assistant", "content": "…" }
  ]
}
```

The question is at most 500 characters, history at most 6 turns of 600 characters each, and the body at most 8 KB (413 above that). Malformed JSON returns 400.

**Response:**

```json
{
  "type": "navigation_suggestion",
  "answer": "Reported hazards are reviewed on the Hazard review screen…",
  "action": { "type": "NAVIGATE", "destinationId": "responder.hazard-review" },
  "references": [
    {
      "id": "screen.hazard-review",
      "kind": "SCREEN_GUIDE",
      "title": "Hazard review screen",
      "version": "1",
      "source": "SAFE CAMPUS app help (draft v1)",
      "reviewState": "DRAFT"
    }
  ],
  "origin": { "source": "AI", "provider": "groq", "model": "<GROQ_MODEL>", "fallbackReason": null },
  "generatedAt": "2026-10-10T12:00:00.000Z"
}
```

- **`type`:** `answer`, `clarification`, `navigation_suggestion`, `guided_tour`, `safety_redirect`, `unsupported` or `unavailable`.
- **`action`:** `null`, `NAVIGATE`, `START_GUIDED_TOUR` or `OPEN_APPROVED_INSTRUCTIONS`. It is only ever a suggestion; the server never executes it.
- **`origin.source`:**
  - `AI`: the hosted model answered, and the answer passed validation.
  - `RULES`: fixed rules answered on purpose (emergencies, action requests).
  - `FALLBACK`: the model was off, failed, was rate-limited or was rejected. `fallbackReason` says which.

The schemas are in `packages/contracts/src/assistant.ts` and `docs/api/openapi.yaml`.

## How a question is handled

1. **Gates, no model call:**
   - Emergency wording returns `safety_redirect`.
   - Imperative action requests (acknowledge, verify, send, alert, call, submit, resolve, change…) return `unsupported`, pointing to the authorised screen.
2. **Knowledge:** content is filtered by the caller's roles, locale, review state and expiry **before** retrieval. Drafts, expired content, unconfirmed contacts and unpublished instruction packs never reach the model.
3. **Retrieval:** keyword retrieval (`knowledge.ts`), plus the guide and status glossary for the current screen. It is deliberately simple and can be swapped for BM25 or embeddings behind `retrieve()`.
4. **Provider call:** a hard timeout, a per-user limit (HTTP 429) and a shared provider budget (fallback when exhausted), which keeps all users under Groq's organisation-wide quota.
5. **Strict validation of model output:**
   - JSON schema (Zod).
   - Allowlisted action type.
   - Target registered **and** permitted for the caller's roles.
   - References must be documents actually supplied.
   - No URLs, unverified phone numbers, official emergency wording, or claims that something was done.
   - Anything else is rejected: `FALLBACK` / `INVALID_OUTPUT`.
6. **Fallback:** a deterministic answer from the same approved content, with the same text checks, labelled `FALLBACK`.

The question and documents are fenced as untrusted data in the prompt (`prompt.ts`). The deterministic fallback runs the same post-checks, so an injected document can't leak through it.

## Configuration (server environment only)

| Variable                                         | Default      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ASSISTANT_PROVIDER`                             | `disabled`   | `disabled`, `mock` (development, labelled "mock") or `groq`                                                                                                                                                                                                                                                                                                                                                                     |
| `GROQ_API_KEY`                                   | —            | **Secret.** Server env / hosting secret only. Never in the web app, `VITE_*`, git, logs or responses.                                                                                                                                                                                                                                                                                                                           |
| `GROQ_MODEL`                                     | —            | **Required for groq, no default.** Choose a model that Groq lists as supporting strict structured outputs ([docs](https://console.groq.com/docs/structured-outputs)). As of 10 Oct 2026 those docs listed `openai/gpt-oss-20b`, `openai/gpt-oss-120b` and `qwen/qwen3.8-27b`; recheck before deploying. At startup the API checks the model against Groq's live `/models` list and reports `modelCheck` in `/assistant/health`. |
| `ASSISTANT_TIMEOUT_MS`                           | `10000`      | Per provider call (1000–30000)                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ASSISTANT_RATE_LIMIT_PER_MINUTE` / `_PER_DAY`   | `8` / `150`  | Per user, so HTTP 429 with `Retry-After`                                                                                                                                                                                                                                                                                                                                                                                        |
| `ASSISTANT_PROVIDER_MAX_PER_MINUTE` / `_PER_DAY` | `25` / `900` | Shared across all users; keep below your Groq limits                                                                                                                                                                                                                                                                                                                                                                            |
| `ASSISTANT_ALLOW_DRAFT_CONTENT`                  | `false`      | Honoured only when `OPERATING_MODE=DEMO`. Lets Tom use its **unreviewed** app-help drafts (labelled `DRAFT`). Contacts and instruction packs are never drafts.                                                                                                                                                                                                                                                                  |
| `CORS_ALLOWED_ORIGINS`                           | empty        | Exact frontend origins, comma-separated (a bare host means `https://host`). Localhost is allowed only outside production.                                                                                                                                                                                                                                                                                                       |

`ASSISTANT_PROVIDER=groq` without a key and model fails at startup with a clear message.

**Groq integration:** it uses Groq's documented OpenAI-compatible HTTP API (`POST /openai/v1/chat/completions` with `response_format: json_schema, strict: true`) through `fetch`. There is no SDK dependency, which keeps the API's lockfile unchanged.

## Run locally

```bash
docker compose up -d          # Postgres (repo root)
cp services/api/.env.example services/api/.env   # then edit; .env is git-ignored
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev                      # API on http://localhost:3000
```

Put `GROQ_API_KEY` and `GROQ_MODEL` in `services/api/.env` (git-ignored) with `ASSISTANT_PROVIDER=groq`, or use `ASSISTANT_PROVIDER=mock` to work without a key.

**Live smoke test** (one real request; prints provenance and the answer, never the key; exit code 0 only if Groq answered):

```bash
pnpm --filter @sahaya/api assistant:smoke
```

**Frontend:** run `pnpm dev:web` (set `VITE_API_BASE_URL=http://127.0.0.1:3000` in `apps/web/.env.local`). Sign in with a seeded **fictional** DEMO account; Tom uses the session token automatically.

## Deploy (Render Blueprint, `render.yaml` at the repo root)

**Creates:**

- `safe-campus-api`: Node web service on this branch.
- `safe-campus-web`: static site for `apps/web`.
- `safe-campus-db`: free Postgres.

**Steps (account actions are yours):**

1. In Render: **New → Blueprint**, then pick this repository and the branch holding `render.yaml`.
2. When prompted, enter `GROQ_API_KEY` (from console.groq.com) and `GROQ_MODEL`. They are stored in Render's private environment settings.
3. **Wiring:**
   - Render sets `VITE_API_BASE_URL` (static site) and `CORS_ALLOWED_ORIGINS` (API) from each other's hostnames.
   - `JWT_SECRET` is generated.
   - The API binds to Render's `PORT`.
4. **Build:** `npx -y pnpm@11.25.0 install --frozen-lockfile --prod=false && npx -y pnpm@11.25.0 build`.
5. **Start:** `migrate.js` then `seed.js` (both idempotent), then `server.js`.
6. **Health check:** `/api/v1/assistant/health`.
7. **Verify:**
   - `https://<api>/api/v1/assistant/health` shows `"provider":"groq"` and `"modelCheck":"ok"`.
   - Open the static site on another device, sign in with the demo responder account, and ask Tom a question.
   - The answer label should read "AI answer (groq · <model>)".

**Free-tier limits, checked 10 Oct 2026; recheck before relying on them:**

- **Render:** free web services sleep after 15 minutes idle and take about a minute to wake (the first Tom question after idle is slow). 750 instance-hours per month. **Free Postgres expires 30 days after creation** (1 GB). Static sites are free.
- **Groq:** for the strict-output models listed above, roughly 30 requests/min, 1K/day, 8K tokens/min and 200K tokens/day per organisation. A 429 from Groq becomes a labelled `FALLBACK` (`RATE_LIMITED`), never a fake AI answer.

**Security note for the demo deployment:** the seed creates **fictional accounts with passwords published in this repo**, including an ADMIN. Anyone with the URL can sign in. Keep the deployment DEMO-only with synthetic data, rely on the per-user and provider limits, and remove or rotate the seed accounts before any real use.

## Privacy and logging

- **Sent to Groq:** the question, up to 6 recent turns, the screen id and label, locale, approved document texts, and the ids and labels of targets permitted for the caller.
- **Never sent:** user id, email, token, incident or help-request records, student data, locations, or unconfirmed contacts.
- **Logs:** pino redacts `*.question` and `*.history`. Assistant events log reasons and latencies only, never question text.
- **Errors:** validation errors name fields but never echo the question. Responses never include the prompt or key.

## Known limitations

- **Draft knowledge:** Tom's app-help knowledge is a **draft** (labelled `DRAFT`). A named reviewer must approve entries before any non-demo use.
- **No contacts:** no campus contacts are institution-confirmed yet, so the assistant has none. It points people to the Contacts & resources screen, which shows each number's status.
- **Per-process rate limits:** fine for one instance. Use a shared store before scaling out.
- **Student destinations:** not registered yet (coordinate with Claude Code 1). Tamil answers depend on the model; Tom's UI strings are English until the shared i18n is wired.
- **Retrieval:** keyword-based. Good enough for the small knowledge base; upgrade if it grows.

`render.yaml` is integration-owned: review it with the integration owner before use.
