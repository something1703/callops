# Phase 2 — Data in: ingestion, datasets, assignment

Previous phase: [`PHASE_1.md`](./PHASE_1.md) must be fully done first. Next: [`PHASE_3.md`](./PHASE_3.md).

**Goal:** an admin can upload a real CSV of contacts, build a filtered dataset, and assign it to agents — and an agent actually sees their assigned contacts in the Android app.

## Tasks

- Backend: presigned S3 upload endpoint, `upload_batches` tracking, the `/internal/ingest` endpoint guarded by `SERVICE_TO_SERVICE_SECRET`.
- Lambda (`/etl/ingest_clean.py`): triggered on S3 PUT, parses CSV with pandas, dedupes on phone number, normalizes phone formats, POSTs cleaned batches to `/internal/ingest`. Handle malformed rows by skipping + logging, never by crashing the whole batch.
- Admin web: a CSV upload screen with real upload progress, a contacts table view with filtering (region, status, tags, last-contacted), and a "build dataset" flow that turns a filtered view into a saved, named dataset.
- Admin web: assignment screen — pick a dataset, pick one or more agents, distribute (even split, or manual), writes to `assignments`. This action is audit-logged with which contacts went to whom.
- Backend: agent-scoped endpoint that returns only the calling agent's currently active assignments — enforce this at the query level using the JWT's user ID, not just by trusting the client.
- Android: assigned-contacts list screen pulling from that endpoint, with pull-to-refresh, proper loading skeletons, and the empty state from Phase 1 now correctly showing once contacts exist but before assignment, vs. after assignment.

## UI requirements for this phase

The contacts table needs real pagination (never load all 1 lakh rows into the browser at once), filter controls that are visibly active when applied (chips/badges showing current filters), and the CSV upload flow needs a clear success/failure state with a row count summary, not just a spinner that disappears.

## Definition of done

Upload a CSV of a few thousand rows, filter it into a dataset, assign that dataset to a test agent account, and see those exact contacts appear in that agent's Android app within one refresh cycle.
