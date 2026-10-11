# 13. Phase 7: settings, analytics and deployment hardening

Built on branch `feat/phase7-admin-ops` (from `develop-v2` at `7742fd4`).

## What changed

| Area                       | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **System settings**        | `GET /settings` (staff) and `PUT /admin/settings` (ADMIN): acknowledgement target (T1), escalation prompt (T2, must be later than T1), responders matched per help request, and hours before unattached photo uploads are deleted. Every change needs a **source** (for example an ERT memo) and a reason, and is audited with before/after values. Missing keys use the documented DEMO defaults, and the app says when a default is in use. |
| **Control room uses them** | The help-request timers, the "overdue" count and the timer explanation now come from settings: "(set by an administrator: _source_)" or "(DEMO default values …)". Responder matching uses the configured maximum.                                                                                                                                                                                                                            |
| **Descriptive analytics**  | `GET /admin/analytics?days=7/30/90` (ADMIN, INCIDENT_VERIFIER): reports by category, kind and verification state; help requests by source and status; median and 90th-percentile time to acknowledge and the number over target; per-drill check-ins (safe / asked for help); photo counts. **Counts only**: no predictions and no ranking of people. In DEMO the page says all data is synthetic. Admin page **Analytics** with simple bars. |
| **Photo retention**        | Uploaded photos never attached to a report are deleted after the configured hours: hourly inside the API server, or `pnpm --filter @sahaya/api purge:photos`. Each purge is audited.                                                                                                                                                                                                                                                          |
| **Production seed**        | In production the seed script no longer stores the published DEMO passwords, and clears any stored earlier. DEMO password login was already refused in production.                                                                                                                                                                                                                                                                            |
| **Admin console complete** | Every admin section in the original plan now exists; the "Not built yet" list is gone.                                                                                                                                                                                                                                                                                                                                                        |

Migration `009` adds `system_settings`.

## Verification performed

| Check     | Result                                                                                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API tests | 147 (3 new in `adminOps.integration.test.ts`): defaults and metadata, validation (T2 after T1), role checks, audit before/after, matching respects the maximum; analytics counts and acknowledgement times, roles; purge removes only old unattached uploads. |
| Web tests | 475 (3 new: settings form needs source and reason, analytics page, configurable timers)                                                                                                                                                                       |

**Not verified:** a real deployment (by the integration owner on Render), real PostgreSQL, real devices.

## Deployment notes for the team

- **Migrations:** run `pnpm db:migrate` for `004`–`009`.
- **Sign-in on Render:** production refuses DEMO password login. Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` and `AUTH_ALLOWED_EMAIL_DOMAINS` in the Render dashboard, then create the first admin with `pnpm --filter @sahaya/api admin:grant -- --email … --reason "First administrator"` (needs shell access to the service).
- **Proxy:** `TRUST_PROXY=1` is set in `render.yaml` so sign-in rate limits see client addresses.
- **Timers:** set the agreed ERT values in Admin → System settings.
