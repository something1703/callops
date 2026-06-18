# Phase 1 — Foundations: auth, schema, and a working shell

Previous phase: none, this is the start. Next: [`PHASE_2.md`](./PHASE_2.md).

**Goal:** an admin can sign in with Google on the web app and see an empty-but-real dashboard shell. The agent app shell exists and can sign in too. The database is live on Neon with the real schema. Nothing about calling or contacts works yet — that's fine, this phase is the skeleton everything else hangs on.

## Tasks

- Scaffold `/backend` (Fastify, TypeScript), `/admin-web` (Next.js 14, Tailwind, shadcn/ui), `/android-app` (Kotlin, Compose), each with their own `.env.example`.
- Stand up the Neon Postgres project, run the full schema from `SCHEMA.md` as the first migration via Drizzle.
- Create a dedicated `app_role` Postgres role for the backend's connection string — not the Neon owner role. Apply the `REVOKE` on `audit_log` immediately.
- Implement Google ID token verification on the backend (`google-auth-library`), the `hd`-domain or allow-list check, and JWT minting with the role claim.
- Wire up Google Identity Services on the admin web login page, and Credential Manager on the Android app's login screen.
- Every successful and failed login attempt writes to `audit_log`.
- Build the admin shell: a sidebar/nav layout, a dashboard page that's intentionally empty right now (placeholder cards saying what will live there later), and a protected-route wrapper that redirects unauthenticated users to login.
- Build the Android app shell: login screen, an empty "your assigned contacts" screen with a proper empty state ("nothing assigned yet"), basic bottom nav if there's more than one screen planned.

## UI requirements for this phase

The login screens on both apps should look intentional, not like a framework default — actual spacing, a real wordmark/logo placeholder, no raw unstyled `<button>` elements. The admin shell's nav and layout should already reflect where Phase 2–4 features will live (contacts, assignments, live board, audit) even though those pages are stubs. Loading, error, and empty states are required here too — see `AGENT.md`'s UI bar, it's not optional just because this is the first phase.

## Definition of done

A fresh `git clone`, a Neon connection string, and a Google OAuth client ID are all that's needed to get an admin signed into a real, navigable (if mostly empty) dashboard, and an agent signed into a real (if empty) Android app. No hardcoded users, no skipped auth.
