-- Phase 4: responder operations. A responder's in-app inbox marks which
-- matched help requests they have seen; duty changes are timestamped.
ALTER TABLE help_request_notifications ADD COLUMN seen_at timestamptz;
ALTER TABLE responders ADD COLUMN duty_changed_at timestamptz;
