BEGIN;
CREATE TABLE IF NOT EXISTS avatar_app.gateway_live_issuance (
  scope_id text PRIMARY KEY CHECK (scope_id ~ '^[a-f0-9]{64}$'),
  utc_day date NOT NULL,
  issued smallint NOT NULL CHECK (issued BETWEEN 1 AND 6),
  last_issued_at timestamptz NOT NULL
);
REVOKE ALL ON TABLE avatar_app.gateway_live_issuance FROM PUBLIC;
COMMIT;
