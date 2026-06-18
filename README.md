# CallOps — PSR calling & lead management platform

> Working name, rename freely (find/replace "CallOps" across the repo).

A self-hosted-first platform for assigning a contact database to telecalling agents (PSRs), having them call leads from inside a branded Android app over their own SIM, and giving admins a fully auditable view of every call, assignment, and recording.

This README is the entry point. Read order for a new contributor (human or agent):
1. `README.md` (this file) — what's here and how to run it
2. `ARCHITECTURE.md` — how the pieces fit together and why
3. `SCHEMA.md` — the database, table by table
4. `PHASES.md` — the build plan, phase by phase
5. `AGENT.md` — rules for whoever (or whatever) is writing the code

## What this is

Admins upload a contact list, build filtered datasets from it, and assign chunks to agents. Agents see only their assigned contacts in an Android app and call them through a custom in-app dialer that rides the agent's real SIM (not VoIP) but reports every call event — ring time, answer, talk duration, hangup — back to a backend in real time. Admins get a live "who's on a call right now" board plus historical dashboards and recording playback, all backed by an append-only audit trail.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Admin web | Next.js 14 (TypeScript, App Router) + Tailwind + shadcn/ui | fast to build, good defaults, type-safe |
| PSR Android app | Kotlin + Jetpack Compose | native Telecom framework access, modern UI toolkit |
| Backend API | Node.js + TypeScript + Fastify | one language across backend and frontend |
| Database | PostgreSQL on Neon (free tier) | managed Postgres, scale-to-zero, no server to babysit |
| ORM | Drizzle | type-safe, lightweight, plays well with Neon's serverless driver |
| Auth | Google Identity Services (web) + Credential Manager (Android) | no password system to build or breach |
| Object storage / data lake | AWS S3 with Object Lock | cheap per-GB, no compute floor, write-once for audit integrity |
| ETL | AWS Lambda, Python + pandas | tiny jobs, permanent free tier, no Glue-style cluster overhead |
| Analytics / audit dashboards | Metabase (self-hosted) | free, points straight at Postgres, no per-seat or per-query billing |
| Hosting | Any VPS (Hetzner / DigitalOcean) via Docker Compose + Caddy | predictable flat cost, no vendor lock-in |

## Repo structure

```
/admin-web      Next.js admin panel
/android-app    Kotlin PSR app
/backend        Fastify API + Drizzle schema/migrations
/etl            Lambda functions (Python)
/infra          docker-compose.yml, Caddyfile, deploy scripts
/docs           this set of markdown files
```

## Prerequisites

Mac setup (Homebrew assumed installed):

```bash
brew install --cask android-commandlinetools
brew install --cask android-platform-tools
brew install openjdk@17
brew install --cask docker
brew install --cask dbeaver-community
brew install awscli
brew install git
brew install ngrok
brew install httpie
```

Antigravity (or any editor) for writing code. Android Studio is optional — keep it installed as a fallback for the SDK Manager / emulator / Logcat GUI, but everything can be done via `adb` + Gradle CLI.

## Environment variables

Backend `/backend/.env`:

```
DATABASE_URL=postgres://...           # from Neon
GOOGLE_CLIENT_ID=
JWT_SECRET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
S3_BUCKET=
ALLOWED_EMAIL_DOMAIN=                 # optional — restricts login to a Workspace domain
SERVICE_TO_SERVICE_SECRET=            # shared secret for Lambda -> backend internal calls
```

Admin web `/admin-web/.env.local`:

```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
NEXT_PUBLIC_API_BASE_URL=
```

Never commit any `.env` file. `.env.example` files with empty values should exist in both folders instead.

## Running locally

```bash
cd backend && npm install && npm run dev      # Fastify API on :4000
cd admin-web && npm install && npm run dev    # Next.js on :3000
ngrok http 4000                                # exposes local backend for the Android app to hit during dev
```

Android: open `/android-app` in Antigravity (or Android Studio), plug in a real phone with USB debugging enabled, point `BuildConfig.API_BASE_URL` at your ngrok URL, run.

## Deployment

Single VPS, Docker Compose brings up the backend, admin web, and Metabase containers; Caddy handles TLS and reverse-proxying by domain/subdomain. Postgres lives on Neon (not on the VPS). S3 lives on AWS. See `/infra/docker-compose.yml` and `/infra/Caddyfile` once Phase 4 stands them up.
