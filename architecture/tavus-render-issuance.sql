BEGIN;
CREATE TABLE IF NOT EXISTS avatar_app.tavus_render_issuance (
  scope_id text PRIMARY KEY CHECK (scope_id ~ '^[a-f0-9]{64}$'),
  utc_day date NOT NULL,
  request_ids uuid[] NOT NULL CHECK (cardinality(request_ids) BETWEEN 1 AND 3),
  previous_request_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(previous_request_ids) <= 3),
  request_id uuid NOT NULL,
  reserved_at timestamptz NOT NULL,
  conversation_id text CHECK (conversation_id ~ '^c[A-Za-z0-9_-]{1,63}$'),
  ended_at timestamptz
);
ALTER TABLE avatar_app.tavus_render_issuance ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
REVOKE ALL ON TABLE avatar_app.tavus_render_issuance FROM PUBLIC;
COMMIT;
