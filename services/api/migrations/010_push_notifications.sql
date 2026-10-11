-- Phase 8: Web Push subscriptions for responders. A push only says a help
-- request was matched; the in-app inbox (help_request_notifications) stays
-- the record, and nothing here means a responder has accepted anything.

CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0,
  revoked_at timestamptz
);

CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);

-- How many of the responder's devices the push service accepted (not "read").
ALTER TABLE help_request_notifications ADD COLUMN push_devices integer NOT NULL DEFAULT 0;
ALTER TABLE help_request_notifications ADD COLUMN push_attempted_at timestamptz;
