-- setup-readonly-role.sql
-- Run once on Neon as the owner role.
-- Creates a read-only role for Metabase so it can query Postgres
-- without any write access.
--
-- Usage:
--   psql "$DATABASE_URL" -f setup-readonly-role.sql

-- 1. Create the role (skip if already exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'metabase_reader') THEN
    CREATE ROLE metabase_reader WITH LOGIN PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';
  END IF;
END
$$;

-- 2. Grant connection to the database
GRANT CONNECT ON DATABASE neondb TO metabase_reader;

-- 3. Grant USAGE on the public schema
GRANT USAGE ON SCHEMA public TO metabase_reader;

-- 4. Grant SELECT on all existing tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO metabase_reader;

-- 5. Ensure SELECT is granted on future tables too
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO metabase_reader;

-- 6. Explicitly deny any write permissions (defense in depth)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM metabase_reader;

-- Verify: connect as metabase_reader and confirm you can SELECT but not INSERT.
-- psql "postgres://metabase_reader:PASSWORD@host/neondb?sslmode=require" -c "SELECT count(*) FROM users;"
