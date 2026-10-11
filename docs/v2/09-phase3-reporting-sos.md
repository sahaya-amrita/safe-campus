# 09. Phase 3: reporting, SOS, photos and permissions

Built on branch `feat/phase3-reporting` (from `develop-v2` at `20a1cc1`). Login for testing uses the fictional DEMO accounts (`pnpm --filter @sahaya/api dev:memory` enables DEMO password login locally; production still refuses it).

## What changed

| Area                                | Behaviour                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SOS without a drill or incident** | `POST /sos` (STUDENT). One transaction records an unverified SOS incident (hazard level L1), a help check-in and an OPEN help request. Idempotent by `Idempotency-Key`. Nothing is published as an alert.                                                                                                       |
| **Quick help**                      | `helpDetails` is optional. The server records "No details given (quick help request)."                                                                                                                                                                                                                          |
| **Structured location**             | Check-ins, SOS and reports carry `location {method: GPS \| MANUAL \| NONE, latitude, longitude, accuracyM, capturedAt, landmark}`. Location is no longer folded into the help text.                                                                                                                             |
| **Report contract v2**              | `POST /incidents` takes `category` (FIRE_SMOKE, MEDICAL, PERSONAL_SAFETY, HAZARD, OTHER), `kind` (EMERGENCY or CONCERN), `location` and `attachmentIds`. A floor is required whenever a building is named. A CONCERN never starts a simulated dispatch.                                                         |
| **Photos**                          | `POST /attachments` takes raw JPEG or PNG bytes (5 MB max). The real type is read from the bytes and metadata (EXIF/XMP/APP segments, PNG text and eXIf chunks) is removed again on the server before storage. Uploads are deduplicated per account and capped at 20 unattached. At most 3 photos per report.   |
| **Photo access**                    | `GET /attachments/:id/content`: the owner always; staff only once a photo is attached. RESPONDER-only accounts see help-request photos only for requests in their zone, assigned to them, or notified to them. Every staff view writes `ATTACHMENT_VIEWED` to the audit log. Responses are `private, no-store`. |
| **Responder matching**              | Each new help request is matched to up to three verified, AVAILABLE responders, preferring the same zone (assigned zones, not live GPS). Matches are stored and a SIMULATED notification is queued per responder. Matching never assigns anyone and never tells the student help is coming.                     |
| **Storage**                         | Photo bytes are stored base64 in `attachment_blobs`, so any Postgres works (including hosts with no persistent disk). Migration `005`.                                                                                                                                                                          |

## Student app

- **Help without an event.** "I Need Help" and the full-screen SOS send even when no drill or incident is open; the queue sends it to `/sos` when the server reports none. "I'm safe" still needs an event and fails honestly without one.
- **Photos after the request.** Photos chosen in the help sheet upload _after_ the server receives the request, so they never delay it. Progress is stored on each photo, so a reload or lost connection resumes. The card says "N photos sent with your request", "Sending…" or "N photos not sent yet. They will be tried again."
- **Report form** (`/student/report`):
  - "Is anyone in danger right now?" first, then a category.
  - Fire or smoke asks for building and floor first.
  - Priority is derived (concern = LOW, emergency = HIGH, fire or medical emergency = CRITICAL); students never pick urgency levels.
  - Location: a typed landmark, and device location only after a `PermissionNotice` explains why.
  - Up to 3 photos, re-encoded on the phone first. If a photo fails to upload the report is still sent and says how many made it.
  - Reports are not queued offline; the form says so.
- **Text.** The "no active drill" message in all six languages now says a help request is still sent as an SOS (non-English strings remain unreviewed drafts).

## Responder workspace

Help requests and incident details show the reported location (coordinates, accuracy, capture time, landmark, with low-accuracy and stale fixes flagged, and a map link), photo thumbnails (opened in a sheet), whether it was an SOS, its category, and how many responders were matched. Everything is labelled as reported by the student, not verified.

## Verification performed

| Check                                     | Result                                                                                                                                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API tests                                 | 128 (10 new in `reporting.integration.test.ts`)                                                                                                                                                          |
| Web tests                                 | 460 (10 new: SOS routing, photo upload resume, report form, location line)                                                                                                                               |
| Live, in the browser against `dev:memory` | Demo student with no open event sent help with a photo: received, photo sent and linked. Demo responder saw the SOS, its photo and "1 responder(s) matched". Report form checked at 390 px: no overflow. |

Fixed along the way: the home screen still said help could not be sent without an event; `GET /responders/appropriate` used an array operator the in-memory database cannot run (filters now run in code); the report toggles were under 44 px.

**Not verified:** a real PostgreSQL database, real phones (camera, GPS), real notification delivery (none exists; it is simulated).

## Known limits

- **Photos are stored in the database.** Fine for a prototype; move to private object storage before real use.
- **Unattached uploads are not purged yet.** A cleanup job is needed.
- **"Seen by a responder" on the student's latest check-in card** still says "not tracked"; the SOS screen and profile already show server-confirmed acknowledgement.
- **Reports are online-only.** Help requests are queued offline; reports are not.
