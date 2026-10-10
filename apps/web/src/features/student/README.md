# Amrita Sahaya — student app (Claude Code 1)

Owned paths: this folder, `src/lib/offline/` and `src/i18n/`. Mount it with `<StudentApp />`; it needs no router or global providers. Tests inject `deps`.

## Screens
- **Home:** the brand, the question "How are you right now?", **I'm Safe** and **I Need Help** (both above the fold at 360–430 px in all six languages), the active drill or incident, the latest check-in with its delivery track, and **112**.
- **Guides:** instruction packs and campus contacts (none approved yet).
- **Activity:** sync status (connection, waiting count, last server receipt, offline readiness, storage persistence), the latest check-in, and earlier check-ins.
- **Help sheet** (full screen): call-112 warning, an optional note, optional location (GPS and/or a landmark), optional photos, and a **Send** button pinned at the bottom so a request can go out immediately.

## Contract (Codex 1: `@sahaya/contracts`, `docs/api/openapi.yaml`)
- **Sending:** `POST /api/v1/checkins` with `{status, clientActionId, clientCreatedAt, incidentId XOR drillId, helpDetails?}`. The `Idempotency-Key` header equals `clientActionId`. Bodies are validated with the shared `submitCheckInSchema` before sending, in both the HTTP and the mock adapter.
- **Delivery states** (`MessageDeliveryStatus`):

  | State | When |
  |---|---|
  | `LOCAL_ONLY` | Saved while offline |
  | `QUEUED` | Waiting or retrying while online |
  | `SENDING` | Request in flight |
  | `SERVER_RECEIVED` | 201 receipt from the server |
  | `FAILED` | Refused by the server |
  | `ACKNOWLEDGED` | **Never produced.** No API sets it for students; the responder step says "Not tracked in this prototype". |

- **Session:** every check-in needs a drill or incident. The app uses the first `ACTIVE` drill from `GET /api/v1/drills` and caches the last answer for offline use. If a draft was made with no known session, it's resolved at send time: attached if the server reports an active drill, `FAILED` (no session) if not, kept queued if the server is unreachable.
- **Gaps worked around** (reported to Codex 1; see `contracts/studentContract.ts`):
  - `helpDetails` is required (at least 3 characters), so a quick help request sends a fixed, client-labelled text.
  - There's no location field, so the landmark and GPS are appended to `helpDetails` as labelled lines.
  - There's no upload endpoint for help requests, so photos are kept on the device and never sent.
  - Packs accept only `en`/`ta`, so the other languages fall back to English explicitly.
  - The `POST /checkins` receipt and pack row shapes are copied from `services/api`.

## Location (`location/useLocationCapture.ts`)
**Root causes found:**
1. **`http://<LAN-IP>` is not a secure context.** The browser rejects location in about 4 ms with code 1, which the old UI showed as "permission denied". This was reproduced.
2. **No retry after a failure.**
3. **The permission-prompt wait isn't covered by the Geolocation `timeout`,** so an ignored prompt could spin forever.
4. **Coarse, stale fixes:** low-accuracy mode plus `maximumAge: 60 s`.

**Now:** location starts only on a tap.
- It checks for a secure page, then asks the Permissions API whether access is already denied.
- It watches in high-accuracy mode with `maximumAge: 0`, keeping the best fix. It stops at ≤30 m, or when the student taps "Use this location".
- A 25 s watchdog ends any attempt.
- Each failure has its own state: insecure, unsupported, denied, timeout or unavailable, each with Retry.
- Fixes over 100 m are flagged as low accuracy, and fixes older than 2 minutes as stale.
- The manual landmark field is always available, and the request is always sendable without a location.

## Photos (`attachments/`)
- **Input:** "Take photo" (camera, where the browser supports `capture`) or "Choose photos" (library). Up to 3 photos, at most 15 MB each.
- **Validation:** the real format is identified from the file's bytes (JPEG, PNG or WebP), and the photo must decode.
- **On-device processing:** each photo is re-encoded to JPEG ≤1600 px. That bakes in the camera orientation, **drops all EXIF including GPS**, and computes the SHA-256 the contract expects. Verified in Chromium: no APP1 segment in the output.
- **Storage:** IndexedDB `attachments` (schema v2; the v1→v2 upgrade keeps queued check-ins). Free space is checked before saving, and a full device is reported as such.
- **Lifecycle:**
  - Photos survive a refresh while the student is still composing.
  - On send they're linked to the check-in. Closing the sheet deletes unsent photos.
  - "Delete photos from this phone" is available on the sent check-in.
- **Never transmitted.** The UI says so wherever photos appear.

## Offline (verified vs plausible)
See the final report for the full matrix. In short:
- **Queue:** IndexedDB with idempotent retries, no request while offline, flush on reconnect, timeout/5xx backoff, and recovery of a send interrupted by a reload. Verified by tests and in a real browser.
- **App-shell offline startup:** depends on the service worker, which is configured and statically checked. It's **not runtime-verified**, because this embedded browser refuses service-worker registration.
- **Persistent storage:** requested once, after the first saved check-in. Granting it is at the browser's discretion.

## Languages (`src/i18n/`)
- **Typed dictionaries:** `en` is the source; `ta`, `hi`, `ml`, `te` and `kn` are `UNREVIEWED_DRAFT`.
- **Safety-critical strings** (`SAFETY_CRITICAL_KEYS`, 15 keys) show the English source next to the draft.
- **Adding a language:** one dictionary file plus one entry in `locales.ts`.
