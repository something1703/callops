# Database schema

PostgreSQL, hosted on Neon. This is the canonical reference — `/backend/src/db/schema.ts` (Drizzle) should mirror it exactly. If they ever drift, this file is wrong and needs updating, not the other way around.

## Tables

### `users`

Admins, team leads, and agents all live here — one table, distinguished by `role`.

```sql
CREATE TYPE user_role AS ENUM ('admin', 'team_lead', 'agent');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'agent',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
```

### `upload_batches`

One row per CSV upload, tracks ingestion provenance for audit.

```sql
CREATE TYPE batch_status AS ENUM ('processing', 'completed', 'failed');

CREATE TABLE upload_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by UUID NOT NULL REFERENCES users(id),
  original_filename TEXT NOT NULL,
  row_count INTEGER,
  status batch_status NOT NULL DEFAULT 'processing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `contacts`

```sql
CREATE TYPE contact_status AS ENUM ('new', 'contacted', 'interested', 'not_interested', 'converted', 'do_not_call');

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  region TEXT,
  status contact_status NOT NULL DEFAULT 'new',
  tags TEXT[] NOT NULL DEFAULT '{}',
  source_batch_id UUID REFERENCES upload_batches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contacts_phone ON contacts(phone_number);
CREATE INDEX idx_contacts_status ON contacts(status);
```

Dedup on ingest happens on `phone_number` — the Lambda should skip or merge rows that already exist rather than relying on a hard unique constraint, since legitimately re-uploaded lists shouldn't error the whole batch out.

### `assignments`

```sql
CREATE TYPE assignment_status AS ENUM ('active', 'completed', 'reassigned');

CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  agent_id UUID NOT NULL REFERENCES users(id),
  assigned_by UUID NOT NULL REFERENCES users(id),
  status assignment_status NOT NULL DEFAULT 'active',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_assignments_agent ON assignments(agent_id);
CREATE INDEX idx_assignments_contact ON assignments(contact_id);
```

### `call_events`

One row per call *state transition*, not one row per call — `call_id` groups them. Final state row (`ended`/`failed`) carries the computed durations.

```sql
CREATE TYPE call_state AS ENUM ('dialing', 'ringing', 'active', 'ended', 'failed');

CREATE TABLE call_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL,
  contact_id UUID NOT NULL REFERENCES contacts(id),
  agent_id UUID NOT NULL REFERENCES users(id),
  state call_state NOT NULL,
  event_timestamp TIMESTAMPTZ NOT NULL,
  ring_duration_seconds INTEGER,
  talk_duration_seconds INTEGER,
  recording_s3_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_call_events_call ON call_events(call_id);
CREATE INDEX idx_call_events_agent_time ON call_events(agent_id, event_timestamp);
```

### `audit_log`

Append-only. The app's database role should have `INSERT` and `SELECT` on this table but **not** `UPDATE` or `DELETE` — enforce that with a `REVOKE` after table creation, not just convention.

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_actor_time ON audit_log(actor_id, created_at);

REVOKE UPDATE, DELETE ON audit_log FROM app_role;
```

(`app_role` is whatever role the backend connects as — set this up explicitly in Phase 1, don't connect as the Neon default superuser-ish role for normal app traffic.)

## What writes to `audit_log`

At minimum: every login, every CSV upload, every dataset assignment, every recording playback, every role/status change to a user or contact. If it's not on this list and someone asks "should this be audited," the answer is yes — bias toward logging too much rather than too little.
