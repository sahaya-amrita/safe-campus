# 08. Phase 2: authentication and account security

Built on branch `feat/phase2-auth` (from `develop-v2` at `b1dc75f`).

## Decisions (approved 2026-10-11)

| Question            | Decision                                                                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity provider   | The API's **own email one-time codes**. No external identity service; the API keeps issuing its own JWT.                                                                                        |
| Guest access        | **No.** Accounts only.                                                                                                                                                                          |
| Registration        | **Allow-listed domains** (`AUTH_ALLOWED_EMAIL_DOMAINS`) self-register as `STUDENT`. Staff roles are granted only by an ADMIN; the first ADMIN is created with a server CLI.                     |
| DEMO password login | **Development and tests only** (`DEMO_LOGIN_ENABLED=true`); returns 404 by default. In production it is refused unless `OPERATING_MODE=DEMO` (the team's hosted prototype opted in, `0b3b8e8`). |

## How sign-in works

1. **Request a code.** `POST /auth/otp/request {email}`.
   - **Always the same answer.** The reply is `202 {status: CODE_SENT_IF_ELIGIBLE}` whether or not the address exists or may register, so accounts cannot be discovered.
   - **Who gets an email.** A challenge row is stored every time, so rate limits behave identically. An email goes out only to an **active existing account** (any domain) or a **new address on an allowed domain**.
   - **Rate limits.**
     - 1 request per 60 s per address (`OTP_RESEND_TOO_SOON` with `retryAfterSeconds`).
     - 5 per hour per address (`OTP_RATE_LIMITED`).
     - 30 per 15 minutes per client IP. Set `TRUST_PROXY` behind a proxy.
   - **Old codes stop working.** A new request cancels the previous code.
2. **Enter the code.** `POST /auth/otp/verify {email, code, displayName?}`.
   - **Code rules.** Six digits, valid for 10 minutes, single use, locked after 5 wrong attempts. Failures and locks are audited.
   - **Storage.** Only an **HMAC-SHA256 of the code** is stored. Codes are never logged or audited.
   - **First sign-in.** On an allowed domain it creates the account with the role **STUDENT only** and returns `201` with `created: true`. Eligibility is checked again here, so a guessed code cannot create an account on another domain.
   - **Disabled accounts.** These get `403 ACCOUNT_DISABLED`, and their requests are never emailed.
3. **Access token.** A 2-hour JWT carrying the issue time in milliseconds (`iat_ms`).

## Session and role security

On every authenticated request, `authenticate` now **reloads the account from the database**:

- **Status.** A disabled account gets 401.
- **`sessions_valid_after`.** Tokens issued before it get 401. It is set by "sign out everywhere" and by disabling an account.
- **Roles.** Always taken **from the database**. A token claiming ADMIN gives nothing, and a removed role stops working on the next request.

`PATCH /users/me` changes only the display name and language. Any `roles` field is dropped.

## Administration

All admin endpoints are ADMIN only. Every change needs a reason (5–300 characters) and writes an audit event.

| Endpoint                                                         | Purpose                                                                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET /admin/users?q&role&status&cursor&limit`                    | Search accounts                                                                                                |
| `POST /admin/users/:id/roles {role, reason}`                     | Grant a role (`ROLE_GRANTED`)                                                                                  |
| `POST /admin/users/:id/roles/:role/revoke {reason}`              | Remove a role (`ROLE_REVOKED`). Refused for your own ADMIN role and for the last active ADMIN.                 |
| `POST /admin/users/:id/status {status, reason}`                  | Disable or enable an account. Disabling ends its sessions. Refused for yourself and for the last active ADMIN. |
| `GET /admin/audit-events?action&entityType&actorId&before&limit` | Read-only audit log, newest first                                                                              |

The first ADMIN is created on the server:

```bash
pnpm --filter @sahaya/api admin:grant -- --email you@example.edu --name "Your Name" --reason "First administrator"
```

## Email delivery

| `EMAIL_PROVIDER`     | Behaviour                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `disabled` (default) | `/auth/config` reports `emailDelivery: false`. Code requests return 503, and the sign-in screen says codes cannot be sent.         |
| `dev`                | Codes are kept in memory and readable at `GET /api/v1/dev/mailbox`. Nothing is emailed. **Refused in production.**                 |
| `resend`             | Sends through the Resend HTTPS API. Needs `RESEND_API_KEY` and `EMAIL_FROM` in server secrets. Tested only with a mocked provider. |

## Web app

- **`/auth/login`:** email, then code.
- **`/auth/register`:** name and email (allowed domains only), then code.
- **`/auth/verify`:**
  - The code field uses a numeric keypad and `autocomplete="one-time-code"`.
  - The resend button counts down before it can be used again.
  - "Use a different email" goes back to the first step.
  - The page never says an account exists.
- **DEMO password sign-in** appears only when the server lists `DEMO_PASSWORD`.
- **Welcome screen:** shown once, after a code creates a student account. It asks for no permissions.
- **Profile:** change your display name; "Sign out of all devices" with a confirmation step. Staff get the same option in the sidebar.
- **Admin:**
  - **`/admin/users`:** search, role chips (`aria-pressed`), and a reason sheet before every change.
  - **`/admin/audit`:** filterable, read-only table.

## Local development without PostgreSQL

```bash
pnpm --filter @sahaya/api dev:memory   # API on :3000, in-memory DB, dev mailbox
pnpm dev:web                           # with VITE_API_BASE_URL=http://127.0.0.1:3000
```

The dev server uses three synthetic accounts (`student|responder|admin.demo@example.invalid`, all signing in by email code). New students can register with `@campus.example`. All data is lost on exit.

## Verification performed

**Automated tests:**

| Area          | Tests                            |
| ------------- | -------------------------------- |
| API, new      | 22 (`auth.integration.test.ts`)  |
| API, total    | 118                              |
| Web, new      | 8 (`auth.flow.test.tsx`)         |
| Web, existing | Updated for the new sign-in path |

**API tests cover:**

- Configuration, production refusal of DEMO login and the dev mailbox, and email unavailable.
- Registration as STUDENT only.
- An identical answer for ineligible addresses, with nothing emailed.
- Existing accounts on any domain.
- Hash-only storage, and no codes in the audit log.
- Lockout, expiry, resend limits, the hourly cap and disabled accounts.
- Sign-out everywhere.
- A forged ADMIN token is refused.
- `PATCH /users/me` ignores roles.
- Admin list, search and pagination; grant and revoke taking effect immediately with an audit trail; self-protection and last-admin guards; disable ending sessions; audit paging.
- The Resend sender.

**Live check in the browser,** against `dev:memory` on this machine:

1. Registered `test.student@campus.example` with the code from the dev mailbox, then saw the welcome screen.
2. An admin signed in by code, granted RESPONDER with a reason, and the audit log showed every step.

**Not verified:** real email delivery (no provider key), a real PostgreSQL database (none on this machine; tests use pg-mem), and real devices.

## Known limits and follow-ups

- **IP rate limit is in memory.** Each API instance counts separately.
- **No refresh tokens.** Sessions last up to 2 hours, then the user signs in again.
- **The production seed still creates fictional DEMO accounts** (`render.yaml` runs `seed.js`). Their passwords no longer work in production, but the seed should be split before a real deployment.
- **Seeded DEMO accounts use `@example.invalid` addresses,** which cannot receive email. In production they cannot sign in.
- **Email copy is English only,** and the 6-digit code is the only factor (no second factor).
