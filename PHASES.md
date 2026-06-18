# Build phases — index

Four phases, strict order, one file each. Don't open `PHASE_2.md` until `PHASE_1.md`'s definition of done is fully met — each phase assumes the previous one is actually solid, not just "mostly working."

Read `ARCHITECTURE.md` and `SCHEMA.md` before `PHASE_1.md`. Read `AGENT.md` before writing any code at all — it covers the hard constraints and the UI bar that apply across every phase, not repeated in full in each phase file.

- [`PHASE_1.md`](./PHASE_1.md) — Foundations: auth, schema, and a working shell
- [`PHASE_2.md`](./PHASE_2.md) — Data in: ingestion, datasets, assignment
- [`PHASE_3.md`](./PHASE_3.md) — The actual calling: dialer integration and live events
- [`PHASE_4.md`](./PHASE_4.md) — Audit, analytics, and the polish pass

## Explicitly out of scope for these four phases

Android Enterprise zero-touch enrollment, kiosk-mode device lockdown, and any cloud telephony provider integration (Exotel/Knowlarity-style bridging) are deliberately not in Phase 1–4. They're real, valid future work if the team scales past what own-SIM calling can support — but building them now would be scope creep against a system that isn't proven yet. Raise them as a Phase 5 proposal only after Phase 4 is genuinely done.
