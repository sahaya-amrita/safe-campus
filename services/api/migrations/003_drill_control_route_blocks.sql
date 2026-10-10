-- Drill control: when a drill started and why it stopped (controller, kill switch,
-- or automatic suspension because a live incident was verified).
ALTER TABLE drills ADD COLUMN started_at timestamptz;
ALTER TABLE drills ADD COLUMN stopped_at timestamptz;
ALTER TABLE drills ADD COLUMN stop_reason text;

-- Areas a responder has marked impassable. Routing on the campus map avoids
-- them until a responder clears them. Location is a point plus a radius.
CREATE TABLE route_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  longitude double precision NOT NULL,
  latitude double precision NOT NULL,
  radius_m integer NOT NULL CHECK (radius_m >= 5 AND radius_m <= 200),
  reason text NOT NULL,
  mode operating_mode NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  cleared_by uuid REFERENCES users(id),
  cleared_at timestamptz
);
