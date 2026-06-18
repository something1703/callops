import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  primaryKey,
} from 'drizzle-orm/pg-core';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', ['admin', 'team_lead', 'agent']);

export const batchStatusEnum = pgEnum('batch_status', [
  'processing',
  'completed',
  'failed',
]);

export const contactStatusEnum = pgEnum('contact_status', [
  'new',
  'contacted',
  'interested',
  'not_interested',
  'converted',
  'do_not_call',
]);

export const assignmentStatusEnum = pgEnum('assignment_status', [
  'active',
  'completed',
  'reassigned',
]);

export const callStateEnum = pgEnum('call_state', [
  'dialing',
  'ringing',
  'active',
  'ended',
  'failed',
]);

// ─── Tables ───────────────────────────────────────────────────────────────────

/**
 * users
 * Admins, team leads, and agents all live here — one table, distinguished by role.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  google_sub: text('google_sub').unique().notNull(),
  email: text('email').unique().notNull(),
  name: text('name').notNull(),
  role: userRoleEnum('role').notNull().default('agent'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  last_login_at: timestamp('last_login_at', { withTimezone: true }),
});

/**
 * upload_batches
 * One row per CSV upload. Tracks ingestion provenance for audit.
 */
export const upload_batches = pgTable('upload_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  uploaded_by: uuid('uploaded_by')
    .notNull()
    .references(() => users.id),
  original_filename: text('original_filename').notNull(),
  row_count: integer('row_count'),
  status: batchStatusEnum('status').notNull().default('processing'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * contacts
 * The lead database. Deduped on phone_number at ingest time.
 */
export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  full_name: text('full_name').notNull(),
  phone_number: text('phone_number').notNull(),
  region: text('region'),
  status: contactStatusEnum('status').notNull().default('new'),
  tags: text('tags').array().notNull().default([]),
  source_batch_id: uuid('source_batch_id').references(() => upload_batches.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * assignments
 * Which contact is assigned to which agent, by whom.
 */
export const assignments = pgTable('assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  contact_id: uuid('contact_id')
    .notNull()
    .references(() => contacts.id),
  agent_id: uuid('agent_id')
    .notNull()
    .references(() => users.id),
  assigned_by: uuid('assigned_by')
    .notNull()
    .references(() => users.id),
  status: assignmentStatusEnum('status').notNull().default('active'),
  assigned_at: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * call_events
 * One row per call *state transition*, not one row per call.
 * call_id groups all transitions for a single call.
 * Final state row (ended/failed) carries the computed durations.
 */
export const call_events = pgTable('call_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  call_id: uuid('call_id').notNull(),
  contact_id: uuid('contact_id')
    .notNull()
    .references(() => contacts.id),
  agent_id: uuid('agent_id')
    .notNull()
    .references(() => users.id),
  state: callStateEnum('state').notNull(),
  event_timestamp: timestamp('event_timestamp', { withTimezone: true }).notNull(),
  ring_duration_seconds: integer('ring_duration_seconds'),
  talk_duration_seconds: integer('talk_duration_seconds'),
  recording_s3_key: text('recording_s3_key'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * audit_log
 * Append-only. The app_role has INSERT and SELECT only — UPDATE and DELETE
 * are explicitly revoked via setup-roles.sql. Never relax this.
 */
export const audit_log = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actor_id: uuid('actor_id').references(() => users.id),
  action: text('action').notNull(),
  target_type: text('target_type'),
  target_id: uuid('target_id'),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * datasets
 * A named snapshot of a filtered contact set, created by an admin.
 * Used as the unit of assignment — admin picks a dataset, picks agents,
 * and assignment rows are created for each contact in the dataset.
 */
export const datasets = pgTable('datasets', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  created_by: uuid('created_by')
    .notNull()
    .references(() => users.id),
  // Stored filter criteria for provenance — not enforced, just recorded.
  filter_params: jsonb('filter_params').notNull().default({}),
  contact_count: integer('contact_count').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * dataset_contacts
 * The many-to-many join table between datasets and contacts.
 * Snapshot at creation time — a dataset is immutable once built.
 */
export const dataset_contacts = pgTable(
  'dataset_contacts',
  {
    dataset_id: uuid('dataset_id')
      .notNull()
      .references(() => datasets.id),
    contact_id: uuid('contact_id')
      .notNull()
      .references(() => contacts.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.dataset_id, t.contact_id] }),
  }),
);

// ─── Inferred types (for use in application code) ─────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UploadBatch = typeof upload_batches.$inferSelect;
export type NewUploadBatch = typeof upload_batches.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Assignment = typeof assignments.$inferSelect;
export type NewAssignment = typeof assignments.$inferInsert;
export type Dataset = typeof datasets.$inferSelect;
export type NewDataset = typeof datasets.$inferInsert;
export type DatasetContact = typeof dataset_contacts.$inferSelect;
export type CallEvent = typeof call_events.$inferSelect;
export type AuditLog = typeof audit_log.$inferSelect;
export type NewAuditLog = typeof audit_log.$inferInsert;
