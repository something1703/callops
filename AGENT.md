# Agent instructions

You are building CallOps end to end, following `PHASES.md` in strict order. Read `README.md`, `ARCHITECTURE.md`, and `SCHEMA.md` before writing any code. This file is the rulebook — when in doubt, these rules win over your own judgment about what would be "nicer."

## Hard constraints — do not deviate without asking

- Do not introduce AWS Glue, Athena, QuickSight, Redshift, or RDS. The architecture deliberately avoids these because they bill for compute-cluster overhead regardless of job size. If a task seems to need one of these, you're almost certainly missing a simpler option (pandas, a plain SQL query, DuckDB) — stop and reconsider before reaching for managed big-data tooling.
- Do not build a custom password/login system. Auth is Google Sign-In only, verified server-side, as described in `ARCHITECTURE.md`.
- Do not use Flutter, React Native, or any cross-platform framework for the Android app. It's native Kotlin because the app's entire value is deep `ConnectionService`/`InCallService`/`RoleManager` integration that cross-platform bridges handle poorly.
- Do not skip a phase or jump ahead because a later task looks easy. `PHASES.md` order exists because later phases assume earlier ones are solid — agent-scoped data access in Phase 3 assumes the JWT/role system from Phase 1 is actually correct, for example.
- Do not add a new major dependency (a new database, a new auth provider, a new cloud service, a new ORM) without flagging it and explaining why the ones already chosen don't work. Small, obviously-scoped libraries (a date formatting helper, a CSV parser) don't need this — judgment call, but err toward asking.

## Security, non-negotiable

- Never commit `.env` files, API keys, JWT secrets, or AWS credentials. Every secret comes from environment variables, and every folder with a `.env` has a checked-in `.env.example` with empty values instead.
- Every database query that's scoped to "the current user's data" must filter by the user ID extracted from the verified JWT server-side — never trust a client-supplied user/agent ID in a request body or query param for access control.
- All SQL goes through parameterized queries / the ORM. No string-concatenated SQL, ever, even for "internal" endpoints.
- `audit_log` inserts happen at the same time as the action they're logging, not as an afterthought added later — if you're writing the assignment-creation endpoint, the audit insert is part of that same code path, same transaction if practical.

## UI bar — applies from Phase 1 onward, not just the Phase 4 polish pass

- Every screen ships with a loading state, an error state, and an empty state. A screen that only renders correctly when the data happens to be present and the network happens to work is not finished.
- No raw unstyled HTML form elements on the web app — use the shadcn/ui components consistently rather than mixing styled and unstyled controls.
- Spacing and typography should be consistent across screens built in different phases — if Phase 1's dashboard uses a particular card padding and heading size, Phase 2's contacts table uses the same, not whatever felt convenient at the time.
- On Android, every list (contacts, call history) needs a real loading skeleton, not a blank screen during fetch, and pull-to-refresh where the data is expected to change.
- Buttons that trigger irreversible or expensive actions (assign a dataset, end a call) need an obvious, unambiguous label — never an icon-only button with no text for anything destructive or important.

## Code standards

- TypeScript: strict mode on, no `any` without a comment explaining why it was unavoidable.
- Kotlin: follow standard Android lint defaults, no suppressed warnings without a comment.
- Naming: table names and columns match `SCHEMA.md` exactly — if the schema says `talk_duration_seconds`, the code says `talk_duration_seconds`, not `talkDuration` or `duration_secs`.
- Every endpoint that writes data has at least one test covering the access-control check (right user can write, wrong user gets rejected) before moving to the next task — this matters more than UI tests at this stage.

## Workflow

- Commit after each completed task in `PHASES.md`, not after each phase — small commits, clear messages referencing the task.
- If a task in `PHASES.md` turns out to be ambiguous or underspecified, make the smallest reasonable assumption, note it in the commit message or a `NOTES.md` if one doesn't exist yet, and keep moving — don't block on asking unless it's one of the hard-constraint items above.
- At the end of each phase, re-read that phase's "definition of done" in `PHASES.md` literally and verify each clause before declaring the phase complete.
