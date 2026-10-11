-- Phase 6: drill after-action reviews and reviews of Tom's help content.

CREATE TABLE drill_reviews (
  drill_id uuid PRIMARY KEY REFERENCES drills(id) ON DELETE CASCADE,
  summary text NOT NULL,
  went_well text NOT NULL DEFAULT '',
  to_improve text NOT NULL DEFAULT '',
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- An approval covers one exact text (content_hash); editing the text in
-- code changes the hash, so the approval no longer applies.
CREATE TABLE assistant_content_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id text NOT NULL,
  content_hash text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
  notes text NOT NULL,
  valid_until timestamptz,
  reviewer_id uuid NOT NULL REFERENCES users(id),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assistant_content_reviews_doc_idx ON assistant_content_reviews (doc_id, reviewed_at);
