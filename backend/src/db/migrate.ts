/**
 * run-migration.ts
 * Pushes the full CallOps schema to Neon directly via the HTTP driver.
 * Use this instead of `drizzle-kit push` when the interactive TUI is a problem.
 *
 *   npm run db:migrate
 */

import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrate() {
  console.log('🔄 Running CallOps schema migration against Neon...\n');

  const statements = [
    // ── Enums ──────────────────────────────────────────────────────────────
    `DO $$ BEGIN
       CREATE TYPE "public"."user_role" AS ENUM('admin', 'team_lead', 'agent');
     EXCEPTION WHEN duplicate_object THEN null; END $$`,

    `DO $$ BEGIN
       CREATE TYPE "public"."batch_status" AS ENUM('processing', 'completed', 'failed');
     EXCEPTION WHEN duplicate_object THEN null; END $$`,

    `DO $$ BEGIN
       CREATE TYPE "public"."contact_status" AS ENUM('new', 'contacted', 'interested', 'not_interested', 'converted', 'do_not_call');
     EXCEPTION WHEN duplicate_object THEN null; END $$`,

    `DO $$ BEGIN
       CREATE TYPE "public"."assignment_status" AS ENUM('active', 'completed', 'reassigned');
     EXCEPTION WHEN duplicate_object THEN null; END $$`,

    `DO $$ BEGIN
       CREATE TYPE "public"."call_state" AS ENUM('dialing', 'ringing', 'active', 'ended', 'failed');
     EXCEPTION WHEN duplicate_object THEN null; END $$`,

    // ── Tables ─────────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS "users" (
       "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
       "google_sub"     text NOT NULL,
       "email"          text NOT NULL,
       "name"           text NOT NULL,
       "role"           "user_role" DEFAULT 'agent' NOT NULL,
       "is_active"      boolean DEFAULT true NOT NULL,
       "created_at"     timestamptz DEFAULT now() NOT NULL,
       "last_login_at"  timestamptz,
       CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub"),
       CONSTRAINT "users_email_unique" UNIQUE("email")
     )`,

    `CREATE TABLE IF NOT EXISTS "upload_batches" (
       "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
       "uploaded_by"       uuid NOT NULL REFERENCES "users"("id"),
       "original_filename" text NOT NULL,
       "row_count"         integer,
       "status"            "batch_status" DEFAULT 'processing' NOT NULL,
       "created_at"        timestamptz DEFAULT now() NOT NULL
     )`,

    `CREATE TABLE IF NOT EXISTS "contacts" (
       "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
       "full_name"       text NOT NULL,
       "phone_number"    text NOT NULL,
       "region"          text,
       "status"          "contact_status" DEFAULT 'new' NOT NULL,
       "tags"            text[] NOT NULL DEFAULT '{}',
       "source_batch_id" uuid REFERENCES "upload_batches"("id"),
       "created_at"      timestamptz DEFAULT now() NOT NULL,
       "updated_at"      timestamptz DEFAULT now() NOT NULL
     )`,

    `CREATE INDEX IF NOT EXISTS "idx_contacts_phone"  ON "contacts"("phone_number")`,
    `CREATE INDEX IF NOT EXISTS "idx_contacts_status" ON "contacts"("status")`,

    `CREATE TABLE IF NOT EXISTS "assignments" (
       "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
       "contact_id"  uuid NOT NULL REFERENCES "contacts"("id"),
       "agent_id"    uuid NOT NULL REFERENCES "users"("id"),
       "assigned_by" uuid NOT NULL REFERENCES "users"("id"),
       "status"      "assignment_status" DEFAULT 'active' NOT NULL,
       "assigned_at" timestamptz DEFAULT now() NOT NULL
     )`,

    `CREATE INDEX IF NOT EXISTS "idx_assignments_agent"   ON "assignments"("agent_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_assignments_contact" ON "assignments"("contact_id")`,

    `CREATE TABLE IF NOT EXISTS "call_events" (
       "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
       "call_id"               uuid NOT NULL,
       "contact_id"            uuid NOT NULL REFERENCES "contacts"("id"),
       "agent_id"              uuid NOT NULL REFERENCES "users"("id"),
       "state"                 "call_state" NOT NULL,
       "event_timestamp"       timestamptz NOT NULL,
       "ring_duration_seconds" integer,
       "talk_duration_seconds" integer,
       "recording_s3_key"      text,
       "created_at"            timestamptz DEFAULT now() NOT NULL
     )`,

    `CREATE INDEX IF NOT EXISTS "idx_call_events_call"       ON "call_events"("call_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_call_events_agent_time" ON "call_events"("agent_id", "event_timestamp")`,

    // audit_log — append-only; REVOKE UPDATE/DELETE is applied separately in setup-roles.sql
    `CREATE TABLE IF NOT EXISTS "audit_log" (
       "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
       "actor_id"    uuid REFERENCES "users"("id"),
       "action"      text NOT NULL,
       "target_type" text,
       "target_id"   uuid,
       "metadata"    jsonb,
       "created_at"  timestamptz DEFAULT now() NOT NULL
     )`,

    `CREATE INDEX IF NOT EXISTS "idx_audit_log_actor_time" ON "audit_log"("actor_id", "created_at")`,
  ];

  for (const stmt of statements) {
    try {
      await sql(stmt);
      const label = stmt.trim().split('\n')[0].slice(0, 60);
      console.log(`  ✓ ${label}…`);
    } catch (err: unknown) {
      console.error(`  ✗ FAILED: ${stmt.trim().slice(0, 60)}…`);
      console.error(`    ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  console.log('\n✅ Schema migration complete. All 6 tables and indexes are live on Neon.');
  console.log('\n⚠️  Next step: run setup-roles.sql with the Neon owner credentials');
  console.log('   to create app_role and REVOKE UPDATE/DELETE on audit_log.\n');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('❌ Migration failed unexpectedly:', err);
  process.exit(1);
});
