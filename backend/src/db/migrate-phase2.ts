/**
 * Appends datasets and dataset_contacts tables to the existing migration.
 * Run with: npx tsx src/db/migrate-phase2.ts
 */

import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function migrate() {
  console.log('🔄 Phase 2 schema additions...\n');

  const stmts = [
    `CREATE TABLE IF NOT EXISTS "datasets" (
       "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
       "name"           text NOT NULL,
       "created_by"     uuid NOT NULL REFERENCES "users"("id"),
       "filter_params"  jsonb NOT NULL DEFAULT '{}',
       "contact_count"  integer NOT NULL DEFAULT 0,
       "created_at"     timestamptz DEFAULT now() NOT NULL
     )`,

    `CREATE TABLE IF NOT EXISTS "dataset_contacts" (
       "dataset_id"  uuid NOT NULL REFERENCES "datasets"("id"),
       "contact_id"  uuid NOT NULL REFERENCES "contacts"("id"),
       PRIMARY KEY ("dataset_id", "contact_id")
     )`,

    `CREATE INDEX IF NOT EXISTS "idx_dataset_contacts_dataset" ON "dataset_contacts"("dataset_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_dataset_contacts_contact" ON "dataset_contacts"("contact_id")`,
  ];

  for (const stmt of stmts) {
    await sql(stmt);
    console.log(`  ✓ ${stmt.trim().split('\n')[0].slice(0, 60)}…`);
  }

  console.log('\n✅ Phase 2 tables live.');
  process.exit(0);
}

migrate().catch((e) => { console.error(e); process.exit(1); });
