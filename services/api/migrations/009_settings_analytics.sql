-- Phase 7: administrator-managed system settings (timers, matching, photo
-- retention). Missing keys fall back to documented DEMO defaults.
CREATE TABLE system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  source text NOT NULL,
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
