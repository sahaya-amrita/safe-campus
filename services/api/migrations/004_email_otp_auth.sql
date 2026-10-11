-- Phase 2: email one-time-code sign-in, account status and session revocation.

-- Accounts created by email OTP have no password. DEMO password login stays
-- available only where DEMO_LOGIN_ENABLED=true outside production.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('ACTIVE', 'DISABLED'));
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN last_sign_in_at timestamptz;
-- Access tokens issued before this moment are rejected ("sign out everywhere",
-- disabling an account, or removing a role).
ALTER TABLE users ADD COLUMN sessions_valid_after timestamptz;

-- One-time codes. Only an HMAC of the code is stored, never the code itself.
CREATE TABLE auth_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('SIGN_IN', 'REGISTER')),
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_otp_challenges_email_idx ON auth_otp_challenges (email, created_at);
