-- CallOps: role setup script
-- Run this ONCE against Neon using the OWNER connection string (the one from the Neon dashboard).
-- After this, the backend's DATABASE_URL should use app_role, not the owner role.
--
-- Usage (from project root):
--   psql "$DATABASE_URL" -f backend/src/db/setup-roles.sql
--
-- Replace <APP_ROLE_PASSWORD> with a strong random password before running.
-- Store that password in your .env as part of the app_role connection string.

-- 1. Create the restricted application role
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_role') THEN
    CREATE ROLE app_role WITH LOGIN PASSWORD '<APP_ROLE_PASSWORD>';
  END IF;
END
$$;

-- 2. Grant connection to the database
GRANT CONNECT ON DATABASE neondb TO app_role;

-- 3. Grant usage on the public schema
GRANT USAGE ON SCHEMA public TO app_role;

-- 4. Grant full DML on all current tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;

-- 5. Ensure future tables also get the grant
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_role;

-- 6. Grant sequence usage (needed for UUIDs via gen_random_uuid if any serial sequences exist)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_role;

-- 7. CRITICAL: Revoke UPDATE and DELETE on audit_log — this is a security boundary.
--    app_role may only INSERT and SELECT on audit_log. Never relax this.
REVOKE UPDATE, DELETE ON audit_log FROM app_role;

-- Verify
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'app_role'
ORDER BY table_name, privilege_type;
