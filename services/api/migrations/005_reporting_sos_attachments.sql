-- Phase 3: report contract v2, structured location, SOS outside a session,
-- photo attachments and simulated responder matching.

-- Incidents: category, kind and where the reporter said they were.
ALTER TABLE incidents ADD COLUMN category text;
ALTER TABLE incidents ADD CONSTRAINT incidents_category_check
  CHECK (category IS NULL OR category IN ('FIRE_SMOKE', 'MEDICAL', 'PERSONAL_SAFETY', 'HAZARD', 'OTHER'));
ALTER TABLE incidents ADD COLUMN report_kind text NOT NULL DEFAULT 'EMERGENCY';
ALTER TABLE incidents ADD CONSTRAINT incidents_report_kind_check
  CHECK (report_kind IN ('EMERGENCY', 'CONCERN', 'SOS'));
ALTER TABLE incidents ADD COLUMN location_method text;
ALTER TABLE incidents ADD COLUMN latitude double precision;
ALTER TABLE incidents ADD COLUMN longitude double precision;
ALTER TABLE incidents ADD COLUMN accuracy_m double precision;
ALTER TABLE incidents ADD COLUMN location_captured_at timestamptz;
ALTER TABLE incidents ADD COLUMN landmark text;

-- Check-ins and help requests: the same location fields.
ALTER TABLE student_checkins ADD COLUMN location_method text;
ALTER TABLE student_checkins ADD COLUMN latitude double precision;
ALTER TABLE student_checkins ADD COLUMN longitude double precision;
ALTER TABLE student_checkins ADD COLUMN accuracy_m double precision;
ALTER TABLE student_checkins ADD COLUMN location_captured_at timestamptz;
ALTER TABLE student_checkins ADD COLUMN landmark text;

ALTER TABLE help_requests ADD COLUMN source text NOT NULL DEFAULT 'CHECKIN';
ALTER TABLE help_requests ADD CONSTRAINT help_requests_source_check
  CHECK (source IN ('CHECKIN', 'SOS'));
ALTER TABLE help_requests ADD COLUMN category text;
ALTER TABLE help_requests ADD COLUMN building_id uuid REFERENCES buildings(id);
ALTER TABLE help_requests ADD COLUMN floor_id uuid REFERENCES floors(id);
ALTER TABLE help_requests ADD COLUMN location_method text;
ALTER TABLE help_requests ADD COLUMN latitude double precision;
ALTER TABLE help_requests ADD COLUMN longitude double precision;
ALTER TABLE help_requests ADD COLUMN accuracy_m double precision;
ALTER TABLE help_requests ADD COLUMN location_captured_at timestamptz;
ALTER TABLE help_requests ADD COLUMN landmark text;

-- Photos. Bytes live in attachment_blobs (base64 text, so any Postgres works);
-- metadata is re-stripped on the server. Unattached uploads can be purged.
CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('image/jpeg', 'image/png')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5000000),
  sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'STORED' CHECK (status IN ('STORED', 'ATTACHED')),
  help_request_id uuid REFERENCES help_requests(id) ON DELETE SET NULL,
  incident_report_id uuid REFERENCES incident_reports(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  attached_at timestamptz,
  UNIQUE (owner_id, sha256)
);
CREATE INDEX attachments_help_request_idx ON attachments (help_request_id);
CREATE INDEX attachments_report_idx ON attachments (incident_report_id);

CREATE TABLE attachment_blobs (
  attachment_id uuid PRIMARY KEY REFERENCES attachments(id) ON DELETE CASCADE,
  data_base64 text NOT NULL
);

-- Responders notified about a help request (simulated delivery in DEMO).
CREATE TABLE help_request_notifications (
  help_request_id uuid NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  responder_id uuid NOT NULL REFERENCES responders(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'SIMULATED' CHECK (channel IN ('SIMULATED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (help_request_id, responder_id)
);
