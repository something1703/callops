-- verify-db-permissions.sql
-- Run as the Neon owner to confirm access-control is correctly configured.
--
-- Usage:
--   psql "$DATABASE_URL" -f verify-db-permissions.sql
--
-- All assertions should return TRUE. Any FALSE means a permission is wrong.

\echo '── Verifying audit_log write restrictions for app_role ──────────────'

-- Check: app_role has INSERT on audit_log
SELECT
  has_table_privilege('app_role', 'audit_log', 'INSERT') AS "app_role can INSERT audit_log (expected: true)";

-- Check: app_role has SELECT on audit_log
SELECT
  has_table_privilege('app_role', 'audit_log', 'SELECT') AS "app_role can SELECT audit_log (expected: true)";

-- Check: app_role CANNOT UPDATE audit_log
SELECT
  NOT has_table_privilege('app_role', 'audit_log', 'UPDATE') AS "app_role cannot UPDATE audit_log (expected: true)";

-- Check: app_role CANNOT DELETE from audit_log
SELECT
  NOT has_table_privilege('app_role', 'audit_log', 'DELETE') AS "app_role cannot DELETE audit_log (expected: true)";

\echo '── Verifying metabase_reader is read-only ────────────────────────────'

-- Check: metabase_reader can SELECT users
SELECT
  has_table_privilege('metabase_reader', 'users', 'SELECT') AS "metabase_reader can SELECT (expected: true)";

-- Check: metabase_reader cannot INSERT
SELECT
  NOT has_table_privilege('metabase_reader', 'users', 'INSERT') AS "metabase_reader cannot INSERT (expected: true)";

-- Check: metabase_reader cannot UPDATE
SELECT
  NOT has_table_privilege('metabase_reader', 'users', 'UPDATE') AS "metabase_reader cannot UPDATE (expected: true)";

-- Check: metabase_reader cannot DELETE
SELECT
  NOT has_table_privilege('metabase_reader', 'users', 'DELETE') AS "metabase_reader cannot DELETE (expected: true)";

\echo '── Done. All expected: true. Any false = misconfigured permission. ───'
