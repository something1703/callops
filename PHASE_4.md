# Phase 4 — Audit, analytics, and the polish pass

Previous phase: [`PHASE_3.md`](./PHASE_3.md) must be fully done first. This is the last of the four phases — see `PHASES.md` for what's deliberately out of scope beyond this point.

**Goal:** everything built in Phases 1–3 is now provably auditable, the admin has real historical dashboards instead of raw tables, and both apps get a genuine UI/UX pass rather than "it works."

## Tasks

- Stand up Metabase (Docker, on the VPS) pointed at a read-only Postgres role on Neon. Build the actual dashboards: call volume per agent per day, average talk duration, ring-to-answer rate, leaderboard.
- Recording playback in the admin web app: a "play" control on any call row that has a `recording_s3_key`, fetching a short-lived presigned URL per click — never a permanent public link.
- Archival Lambda: scheduled (e.g. monthly), moves `call_events` rows older than a configured window from Postgres into Parquet in S3, deletes them from Postgres after confirming the write succeeded. This is what keeps Neon's free-tier storage cap from ever becoming a problem.
- `/infra`: write the actual `docker-compose.yml` (backend, admin-web, metabase) and `Caddyfile`, deploy to the VPS, point DNS at it.
- Full UI/UX pass on both apps: consistent spacing and typography across every screen (not just the ones built first), dark mode if it's free with the chosen component libraries, responsive admin web layout down to a reasonable tablet width, Android Compose screens checked on at least two different screen sizes.
- Error-state audit: deliberately break things (kill the backend, revoke a token, upload a malformed CSV, deny the dialer-role prompt) and confirm every one of those produces a real, legible message to the user — not a blank screen or a raw stack trace.
- Security pass: confirm `.env` files are gitignored and were never committed, confirm the agent-scoped endpoints actually reject cross-agent access (test this, don't assume it), confirm `audit_log` genuinely can't be updated or deleted by the app role.

## Definition of done

A new admin can be handed a URL and a login, and without any explanation, successfully upload contacts, assign them, watch a live call happen, and pull up that call's recording and timing from a dashboard — and nothing in that path produces an ugly or broken screen along the way.
