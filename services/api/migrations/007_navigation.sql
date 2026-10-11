-- Phase 5: approved navigation data. Nothing here is used for routing until
-- a second administrator approves it (the proposer cannot approve).

CREATE TABLE safe_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('ASSEMBLY_POINT', 'SHELTER', 'EXIT')),
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  building_id uuid REFERENCES buildings(id),
  notes text,
  status text NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'APPROVED', 'RETIRED')),
  mode operating_mode NOT NULL,
  proposed_by uuid NOT NULL REFERENCES users(id),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE route_graphs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  source text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'RETIRED')),
  graph jsonb NOT NULL,
  node_count integer NOT NULL,
  edge_count integer NOT NULL,
  mode operating_mode NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
