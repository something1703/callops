# Phase 3 — The actual calling: dialer integration and live events

Previous phase: [`PHASE_2.md`](./PHASE_2.md) must be fully done first. Next: [`PHASE_4.md`](./PHASE_4.md).

**Goal:** an agent can tap a contact in the app and place a real call over their own SIM through a custom in-app screen, with every state transition captured, timed, and streamed to the backend — and the admin can see it happening live.

## Tasks

- Android: request `RoleManager.ROLE_DIALER` with a clear, honest explanation screen before triggering the system "set as default phone app" prompt — don't just fire the system dialog with no context.
- Android: implement `ConnectionService` and `InCallService`, build the custom in-app call screen (contact name, mute, speaker, end call, elapsed-time counter that's visibly ticking).
- Android: capture `DIALING → RINGING → ACTIVE → DISCONNECTED` transitions with timestamps, compute `ring_duration_seconds` and `talk_duration_seconds` on disconnect, POST the event set to the backend with the agent's JWT.
- Backend: `/calls/events` endpoint, writes to `call_events` (Postgres) and appends the same payload as JSON to S3 under a call-events prefix with Object Lock / versioning enabled on that bucket.
- Backend: `/calls/live` endpoint returning current in-progress calls (any `call_events` row in `dialing`/`ringing`/`active` state without a later `ended`/`failed` row for that `call_id`).
- Admin web: live call board — table or card view of agents currently on a call, with contact name and elapsed time, refreshing via polling every few seconds (5s is fine, don't over-engineer a websocket for 20 agents unless it's already trivial to add).
- Best-effort call recording: implement `AudioRecord` with `VOICE_CALL` source where the device allows it, fall back gracefully (no crash, just no recording) where it doesn't, and surface to the agent whether recording succeeded for that call.

## UI requirements for this phase

The in-call screen is the single most-used screen in the whole app — it needs to feel instant and obvious (big tap targets, no ambiguity about what "end call" does), and the live board needs a clear visual distinction between "ringing" and "active" states, not just a status text column nobody reads.

## Definition of done

Place a real call from a real test phone to a real number through the app, watch it appear on the admin live board while it's happening, hang up, and confirm the `call_events` rows (with correct durations) exist in both Postgres and S3.
