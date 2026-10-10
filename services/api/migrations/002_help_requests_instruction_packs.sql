CREATE TYPE help_request_status AS ENUM ('OPEN', 'ACKNOWLEDGED', 'ASSIGNED', 'RESOLVED', 'CANCELLED');
CREATE TYPE instruction_pack_approval_state AS ENUM ('DRAFT', 'APPROVED', 'REJECTED', 'PUBLISHED', 'RETIRED');

CREATE TABLE help_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id uuid NOT NULL UNIQUE REFERENCES student_checkins(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  incident_id uuid REFERENCES incidents(id) ON DELETE RESTRICT,
  drill_id uuid REFERENCES drills(id) ON DELETE RESTRICT,
  zone_id uuid REFERENCES zones(id) ON DELETE SET NULL,
  status help_request_status NOT NULL DEFAULT 'OPEN',
  priority incident_priority NOT NULL DEFAULT 'HIGH',
  details text NOT NULL,
  acknowledged_by uuid REFERENCES responders(id) ON DELETE SET NULL,
  assigned_responder_id uuid REFERENCES responders(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  assigned_at timestamptz,
  resolved_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((incident_id IS NOT NULL)::integer + (drill_id IS NOT NULL)::integer = 1)
);
CREATE INDEX help_requests_queue_idx ON help_requests (status, created_at DESC, id DESC);
CREATE INDEX help_requests_zone_idx ON help_requests (zone_id, status, created_at DESC);
CREATE INDEX help_requests_student_idx ON help_requests (student_id, created_at DESC);

CREATE TABLE instruction_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  language text NOT NULL CHECK (language IN ('en', 'ta')),
  title text NOT NULL,
  content jsonb NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[A-Fa-f0-9]{64}$'),
  source_label text NOT NULL,
  source_reference text,
  approval_state instruction_pack_approval_state NOT NULL DEFAULT 'DRAFT',
  review_notes text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  published_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  published_at timestamptz,
  expires_at timestamptz,
  mode operating_mode NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version, language)
);
CREATE INDEX instruction_packs_public_idx
  ON instruction_packs (language, published_at DESC, id DESC)
  WHERE approval_state = 'PUBLISHED';
