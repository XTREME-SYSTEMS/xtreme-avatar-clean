-- Review and apply only on a designated isolated Avatar QA branch.
-- Provision the existing intended LOGIN principal/avatar_task_runtime out of band
-- without role memberships, database ownership, BYPASSRLS or access to other data.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles r
    WHERE r.rolname = 'avatar_task_runtime' AND r.rolcanlogin
      AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole
      AND NOT r.rolcreatedb AND NOT r.rolreplication
      AND NOT EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid)
  ) THEN
    RAISE EXCEPTION 'Provision the isolated, unprivileged Avatar task role before migrating';
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS avatar_task;
REVOKE ALL ON SCHEMA avatar_task FROM PUBLIC;
CREATE TABLE IF NOT EXISTS avatar_task.tasks (
  issuer text NOT NULL CHECK (char_length(issuer) BETWEEN 1 AND 512),
  workspace_id text NOT NULL CHECK (char_length(workspace_id) BETWEEN 1 AND 128),
  subject_id text NOT NULL CHECK (char_length(subject_id) BETWEEN 1 AND 128),
  request_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issuer, workspace_id, subject_id, request_id)
);
CREATE INDEX IF NOT EXISTS avatar_task_list
  ON avatar_task.tasks (issuer, workspace_id, subject_id, created_at DESC, request_id DESC);
ALTER TABLE avatar_task.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatar_task.tasks FORCE ROW LEVEL SECURITY;
REVOKE ALL ON avatar_task.tasks FROM PUBLIC;
DROP POLICY IF EXISTS personal_task_scope ON avatar_task.tasks;
CREATE POLICY personal_task_scope ON avatar_task.tasks TO avatar_task_runtime
  USING (issuer = current_setting('avatar_task.issuer', true)
    AND workspace_id = current_setting('avatar_task.workspace', true)
    AND subject_id = current_setting('avatar_task.subject', true))
  WITH CHECK (issuer = current_setting('avatar_task.issuer', true)
    AND workspace_id = current_setting('avatar_task.workspace', true)
    AND subject_id = current_setting('avatar_task.subject', true));
GRANT USAGE ON SCHEMA avatar_task TO avatar_task_runtime;
GRANT SELECT, INSERT ON avatar_task.tasks TO avatar_task_runtime;
COMMIT;
