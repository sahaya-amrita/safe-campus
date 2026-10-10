CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE operating_mode AS ENUM ('DEMO', 'DRILL', 'TEST', 'SIMULATION');
CREATE TYPE role_name AS ENUM ('STUDENT', 'RESPONDER', 'INCIDENT_VERIFIER', 'DRILL_MANAGER', 'ADMIN');
CREATE TYPE incident_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE hazard_verification_status AS ENUM ('REPORTED', 'CORROBORATED', 'VERIFIED', 'RESOLVED', 'DISMISSED');
CREATE TYPE checkin_status AS ENUM ('CONFIRMED_SAFE', 'HELP_REQUESTED');
CREATE TYPE message_delivery_status AS ENUM ('LOCAL_ONLY', 'QUEUED', 'SENDING', 'SERVER_RECEIVED', 'ACKNOWLEDGED', 'FAILED');
CREATE TYPE responder_availability AS ENUM ('AVAILABLE', 'BUSY', 'OFF_DUTY');
CREATE TYPE dispatch_status AS ENUM ('CREATED', 'NOTIFIED', 'ACCEPTED', 'EN_ROUTE', 'ON_SCENE', 'COMPLETED', 'ESCALATED', 'CANCELLED', 'FAILED');
CREATE TYPE alert_status AS ENUM ('DRAFT', 'AUTHORIZED', 'QUEUED', 'CANCELLED', 'ALL_CLEAR');
CREATE TYPE consent_status AS ENUM ('PENDING', 'VERIFIED', 'REVOKED');
CREATE TYPE drill_status AS ENUM ('DRAFT', 'AUTHORIZED', 'ACTIVE', 'COMPLETED', 'REVIEWED');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ta')),
  mode operating_mode NOT NULL DEFAULT 'DEMO',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role role_name NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  mode operating_mode NOT NULL,
  geometry_version text,
  geometry_approved boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, mode)
);

CREATE TABLE floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name text NOT NULL,
  level_number integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_id, level_number)
);

CREATE TABLE zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id uuid NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  name text NOT NULL,
  zone_code text NOT NULL,
  geometry jsonb,
  geometry_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (floor_id, zone_code)
);

CREATE TABLE zone_memberships (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('ASSIGNED', 'SUBSCRIBED', 'DEMO')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, zone_id)
);

CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  description text NOT NULL,
  priority incident_priority NOT NULL,
  verification_status hazard_verification_status NOT NULL DEFAULT 'REPORTED',
  mode operating_mode NOT NULL,
  reporter_id uuid NOT NULL REFERENCES users(id),
  building_id uuid REFERENCES buildings(id),
  floor_id uuid REFERENCES floors(id),
  zone_id uuid REFERENCES zones(id),
  duplicate_group_key text,
  occurred_at timestamptz,
  server_received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incidents_status_created_idx ON incidents (verification_status, created_at DESC);
CREATE INDEX incidents_zone_created_idx ON incidents (zone_id, created_at DESC);
CREATE INDEX incidents_reporter_idx ON incidents (reporter_id, created_at DESC);
CREATE INDEX incidents_duplicate_idx ON incidents (duplicate_group_key) WHERE duplicate_group_key IS NOT NULL;

CREATE TABLE incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES users(id),
  description text NOT NULL,
  zone_id uuid REFERENCES zones(id),
  observed_at timestamptz,
  server_received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incident_reports_incident_idx ON incident_reports (incident_id, created_at);

CREATE TABLE incident_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES incident_reports(id) ON DELETE CASCADE,
  object_key text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('image/jpeg', 'image/png', 'video/mp4')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10000000),
  sha256 text NOT NULL CHECK (sha256 ~ '^[A-Fa-f0-9]{64}$'),
  retention_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE incident_verification_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id),
  reviewer_id uuid NOT NULL REFERENCES users(id),
  from_status hazard_verification_status NOT NULL,
  to_status hazard_verification_status NOT NULL,
  reason text NOT NULL,
  evidence_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_incident_idx ON incident_verification_records (incident_id, created_at);

CREATE TABLE drills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  building_id uuid NOT NULL REFERENCES buildings(id),
  scenario_ref text NOT NULL,
  scenario_version text NOT NULL,
  mode operating_mode NOT NULL CHECK (mode IN ('DRILL', 'TEST', 'SIMULATION')),
  status drill_status NOT NULL DEFAULT 'DRAFT',
  authorized_by uuid REFERENCES users(id),
  authorized_at timestamptz,
  assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE student_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users(id),
  incident_id uuid REFERENCES incidents(id),
  drill_id uuid REFERENCES drills(id),
  status checkin_status NOT NULL,
  help_details text,
  delivery_status message_delivery_status NOT NULL DEFAULT 'SERVER_RECEIVED',
  client_action_id uuid NOT NULL,
  client_created_at timestamptz NOT NULL,
  server_received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((incident_id IS NOT NULL)::integer + (drill_id IS NOT NULL)::integer = 1),
  CHECK (status <> 'HELP_REQUESTED' OR help_details IS NOT NULL),
  UNIQUE (student_id, client_action_id)
);
CREATE INDEX checkins_incident_latest_idx ON student_checkins (incident_id, student_id, server_received_at DESC);
CREATE INDEX checkins_drill_latest_idx ON student_checkins (drill_id, student_id, server_received_at DESC);
CREATE INDEX checkins_help_idx ON student_checkins (status, server_received_at DESC) WHERE status = 'HELP_REQUESTED';

CREATE TABLE responders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  approved_role text NOT NULL,
  qualifications text[] NOT NULL DEFAULT '{}',
  assigned_zone_id uuid REFERENCES zones(id),
  availability responder_availability NOT NULL DEFAULT 'OFF_DUTY',
  contact_channel text NOT NULL CHECK (contact_channel IN ('IN_APP', 'CONTROL_ROOM')),
  verified boolean NOT NULL DEFAULT false,
  verified_by uuid REFERENCES users(id),
  verified_at timestamptz,
  duty_schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  mode operating_mode NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX responders_match_idx ON responders (assigned_zone_id, verified, availability);

CREATE TABLE dispatch_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id),
  responder_id uuid REFERENCES responders(id),
  response_category text NOT NULL,
  status dispatch_status NOT NULL DEFAULT 'CREATED',
  mode operating_mode NOT NULL,
  acknowledged_at timestamptz,
  escalation_level integer NOT NULL DEFAULT 0 CHECK (escalation_level >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dispatch_status_idx ON dispatch_assignments (status, created_at);

CREATE TABLE emergency_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid REFERENCES incidents(id),
  title text NOT NULL,
  message text NOT NULL,
  precautionary boolean NOT NULL,
  status alert_status NOT NULL DEFAULT 'DRAFT',
  mode operating_mode NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  authorized_by uuid REFERENCES users(id),
  authorized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alert_zones (
  alert_id uuid NOT NULL REFERENCES emergency_alerts(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones(id),
  PRIMARY KEY (alert_id, zone_id)
);

CREATE TABLE alert_delivery_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES emergency_alerts(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id),
  status message_delivery_status NOT NULL DEFAULT 'QUEUED',
  server_received_at timestamptz,
  acknowledged_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alert_id, recipient_id)
);

CREATE TABLE trusted_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_channel text NOT NULL CHECK (contact_channel IN ('EMAIL', 'PHONE')),
  contact_value_encrypted text NOT NULL,
  consent consent_status NOT NULL DEFAULT 'PENDING',
  notification_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trusted_contacts_owner_idx ON trusted_contacts (owner_id);

CREATE TABLE training_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  drill_id uuid REFERENCES drills(id),
  scenario_ref text NOT NULL,
  scenario_version text NOT NULL,
  score numeric(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  answers jsonb NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE drill_events (
  id bigserial PRIMARY KEY,
  drill_id uuid NOT NULL REFERENCES drills(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id),
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status message_delivery_status NOT NULL DEFAULT 'QUEUED',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pending_idx ON outbox_events (available_at, created_at) WHERE status IN ('QUEUED', 'FAILED');

CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON audit_events (entity_type, entity_id, created_at);
REVOKE UPDATE, DELETE ON audit_events FROM PUBLIC;

CREATE TABLE idempotency_keys (
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  PRIMARY KEY (owner_id, scope, key)
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
