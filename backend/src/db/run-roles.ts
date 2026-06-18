import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function setupRoles() {
  console.log('🔄 Running setup-roles.sql logic via Neon HTTP...');

  const stmts = [
    // 1. Create app_role (ignoring if it exists)
    `DO $$
     BEGIN
       IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_role') THEN
         CREATE ROLE app_role WITH LOGIN PASSWORD 'callops_app_secret_123!';
       END IF;
     END
     $$;`,

    // 2. Grant connect
    `GRANT CONNECT ON DATABASE neondb TO app_role;`,

    // 3. Grant usage on schema
    `GRANT USAGE ON SCHEMA public TO app_role;`,

    // 4. Grant DML on current tables
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;`,

    // 5. Default privileges for future tables
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public
       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_role;`,

    // 6. Sequences
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_role;`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public
       GRANT USAGE, SELECT ON SEQUENCES TO app_role;`,

    // 7. Revoke audit_log
    `REVOKE UPDATE, DELETE ON audit_log FROM app_role;`,
  ];

  for (const stmt of stmts) {
    try {
      await sql(stmt);
      console.log(`  ✓ Executed: ${stmt.trim().split('\n')[0].substring(0, 50)}...`);
    } catch (e: any) {
      console.error(`  ✗ FAILED: ${stmt.trim().substring(0, 50)}...`);
      console.error(e.message);
    }
  }

  console.log('✅ Role setup complete.');
}

setupRoles().catch(console.error);
