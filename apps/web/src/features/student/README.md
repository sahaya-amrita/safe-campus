# Student feature (Claude Code 1)

Task: `docs/tasks/02-student-pwa-claude.md`. Owned paths: this folder, `src/lib/offline/` and `src/i18n/`.

Mount it with `<StudentApp />`. It needs no router or global providers. Tests can inject `deps`.

## Flow
- **I'm Safe**: one tap sends `SAFE`.
- **I Need Help**: opens one optional screen with an optional note (max 500 characters) and an optional one-time location. The send button is first, so neither field blocks sending.
- A second tap of the **same** button within 5 s is ignored and the app says so. Switching from Safe to Need Help is never blocked.

## Delivery states (`docs/api-contracts.md`)
| Queue lifecycle (`lib/offline`) | Contract `DeliveryState` | What the student sees |
| --- | --- | --- |
| QUEUED | `QUEUED_OFFLINE` | NOT SENT — QUEUED ON THIS PHONE, plus the reason: offline, timeout, server unavailable, or waiting |
| SENDING | `PENDING` | SENDING — NOT CONFIRMED YET |
| ACCEPTED | `ACCEPTED` | ACCEPTED BY SERVER, plus "This does NOT mean a responder has seen it." |
| FAILED | `FAILED` | FAILED — NOT DELIVERED (permission denied or rejected), plus the 112 fallback and a Retry button |

## Offline behaviour
- Entries are written to IndexedDB (`safe-campus-student-offline`) **before** the UI shows them.
- Each entry has one `crypto.randomUUID()` idempotency key, reused for every retry.
- **No request is made while offline.** The queue flushes on load and on the browser `online` event.
- Timeouts and 5xx/429 responses retry with backoff: 5 s, 15 s, 30 s, then 60 s.
- 401, 403 and other 4xx responses go to FAILED and are only resent when the student taps Retry.
- An entry still marked SENDING when the app reloads is re-queued and resent with the same key.

## Instruction packs
- Fetched with `GET /api/v1/instruction-packs?language=` and cached per language in IndexedDB.
- Only `APPROVED`/`PUBLISHED` packs are labelled official.
- `DEMO_SAMPLE` packs (from the mock) are always labelled "SAMPLE — NOT OFFICIAL".
- Any other state is never cached or shown.
- Each pack shows its version, language, published and expiry dates, and when it was saved on the phone.
- Expired packs get a warning. Copies not refreshed for 7 days are flagged as possibly out of date.

## Contract assumptions for Codex 1
All of these are listed in `contracts/provisional.ts` §B:
- **B1:** the POST body is `{status, note?, locationReference?}`, and the response is the stored `CheckIn`.
- **B2:** `locationReference` is an RFC 5870 `geo:` URI rounded to 4 decimals.
- **B3:** the note is at most 500 characters.
- **B4:** the official approval states are `APPROVED` and `PUBLISHED`.
- **B5:** a `DEMO_SAMPLE` approval state exists for demo packs.
- **B6:** packs carry `sections[{heading, body}]`.
- **B7:** the pack list response is `{items}`.

## Not done here
- **Service worker / app-shell caching.** That's integration-owned (see `apps/web/SCAFFOLD.md`). Without it, offline data works only while the page is open; reopening the app with no connection needs the integrator's service worker.
- **Responder acknowledgement.** The contract has no student-facing acknowledgement field yet.
- **`contentHash` verification.** No hash algorithm is specified.
- **Tamil review.** The Tamil strings are an unreviewed draft, and the UI says so.
