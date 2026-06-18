import {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from 'fastify';
import { z } from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { eq, inArray, and, notInArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { call_events, assignments, contacts, users } from '../db/schema.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { writeAudit } from '../lib/audit.js';

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-south-1' });
const CALLS_BUCKET = process.env.CALLS_BUCKET!;

// ── Zod schemas ───────────────────────────────────────────────────────────────

const CallEventSchema = z.object({
  state: z.enum(['dialing', 'ringing', 'active', 'ended', 'failed']),
  event_timestamp: z.string().datetime(),
  ring_duration_seconds: z.number().int().nonnegative().optional(),
  talk_duration_seconds: z.number().int().nonnegative().optional(),
  recording_s3_key: z.string().optional(),
});

const SubmitEventsBodySchema = z.object({
  call_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  events: z.array(CallEventSchema).min(1).max(20),
});

// ─────────────────────────────────────────────────────────────────────────────

export async function callRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * POST /api/calls/events
   * Agent submits all state transitions for a completed call.
   * Server verifies the contact is assigned to this agent before writing.
   * Writes to Postgres AND appends a JSON line to S3 (audit trail).
   */
  fastify.post(
    '/api/calls/events',
    { preHandler: [authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).userId as string;

      const body = SubmitEventsBodySchema.safeParse(req.body);
      if (!body.success) {
        return reply.status(400).send({ error: 'Bad Request', message: body.error.message });
      }

      const { call_id, contact_id, events: eventList } = body.data;

      // ── Security: verify this contact is actively assigned to this agent ───
      const [assignment] = await db
        .select()
        .from(assignments)
        .where(
          and(
            eq(assignments.contact_id, contact_id),
            eq(assignments.agent_id, userId),
            eq(assignments.status, 'active'),
          ),
        )
        .limit(1);

      if (!assignment) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'This contact is not actively assigned to you.',
        });
      }

      // ── Postgres insert — all events in one batch ─────────────────────────
      const rows = eventList.map((e) => ({
        call_id,
        contact_id,
        agent_id: userId,
        state: e.state as any,
        event_timestamp: new Date(e.event_timestamp),
        ring_duration_seconds: e.ring_duration_seconds ?? null,
        talk_duration_seconds: e.talk_duration_seconds ?? null,
        recording_s3_key: e.recording_s3_key ?? null,
      }));

      await db.insert(call_events).values(rows);

      // ── S3 append — one JSON line per call (call_id.jsonl) ────────────────
      // Note: S3 doesn't support true append; we write the full payload for
      // this call_id as a single object. Object versioning keeps history.
      const s3Key = `call-events/${new Date().toISOString().slice(0, 10)}/${call_id}.jsonl`;
      const s3Payload = eventList
        .map((e) => JSON.stringify({ call_id, contact_id, agent_id: userId, ...e }))
        .join('\n');

      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: CALLS_BUCKET,
            Key: s3Key,
            Body: s3Payload,
            ContentType: 'application/x-ndjson',
          }),
        );
      } catch (err) {
        // S3 failure must not block the response — events are already in Postgres
        fastify.log.error({ err, call_id }, 'Failed to write call events to S3');
      }

      // ── Audit log ─────────────────────────────────────────────────────────
      await writeAudit({
        actor_id: userId,
        action: 'call_events_submitted',
        target_type: 'call',
        target_id: call_id,
        metadata: {
          event_count: eventList.length,
          final_state: eventList[eventList.length - 1]?.state,
          contact_id,
        },
      });

      // Update contact status to 'contacted' if it's still 'new'
      await db
        .update(contacts)
        .set({ status: 'contacted', updated_at: new Date() })
        .where(and(eq(contacts.id, contact_id), eq(contacts.status, 'new')));

      return reply.status(201).send({ ok: true, call_id, events_written: eventList.length });
    },
  );

  /**
   * GET /api/calls/live
   * Returns all call_ids that have an in-progress state (dialing/ringing/active)
   * but no terminal state (ended/failed) for the same call_id.
   * Admin/team_lead only.
   */
  fastify.get(
    '/api/calls/live',
    { preHandler: [authenticate, requireRole(['admin', 'team_lead'])] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      // Find call_ids with a terminal event
      const terminalCallIds = await db
        .selectDistinct({ call_id: call_events.call_id })
        .from(call_events)
        .where(inArray(call_events.state, ['ended', 'failed'] as any[]));

      const terminalIds = terminalCallIds.map((r) => r.call_id);

      // Find the latest event for each live call
      // We do this in two queries for clarity — a single CTE would be cleaner
      // but Drizzle ORM doesn't yet support CTEs cleanly in all versions.
      const liveQuery = terminalIds.length > 0
        ? db
            .select()
            .from(call_events)
            .where(
              and(
                inArray(call_events.state, ['dialing', 'ringing', 'active'] as any[]),
                notInArray(call_events.call_id, terminalIds),
              ),
            )
        : db
            .select()
            .from(call_events)
            .where(inArray(call_events.state, ['dialing', 'ringing', 'active'] as any[]));

      const liveEvents = await liveQuery;

      if (liveEvents.length === 0) {
        return reply.send({ calls: [] });
      }

      // De-duplicate: keep only the most recent event per call_id
      const latestByCall = new Map<string, typeof liveEvents[0]>();
      for (const event of liveEvents) {
        const existing = latestByCall.get(event.call_id);
        if (!existing || event.event_timestamp > existing.event_timestamp) {
          latestByCall.set(event.call_id, event);
        }
      }

      // Find the first event per call for "started_at"
      const firstByCall = new Map<string, typeof liveEvents[0]>();
      for (const event of liveEvents) {
        const existing = firstByCall.get(event.call_id);
        if (!existing || event.event_timestamp < existing.event_timestamp) {
          firstByCall.set(event.call_id, event);
        }
      }

      // Collect unique agent + contact IDs for a single join fetch
      const agentIds = [...new Set(liveEvents.map((e) => e.agent_id))];
      const contactIds = [...new Set(liveEvents.map((e) => e.contact_id))];

      const [agentRows, contactRows] = await Promise.all([
        db.select().from(users).where(inArray(users.id, agentIds)),
        db.select().from(contacts).where(inArray(contacts.id, contactIds)),
      ]);

      const agentMap = new Map(agentRows.map((a) => [a.id, a]));
      const contactMap = new Map(contactRows.map((c) => [c.id, c]));

      const calls = [...latestByCall.entries()].map(([callId, event]) => {
        const agent = agentMap.get(event.agent_id);
        const contact = contactMap.get(event.contact_id);
        const firstEvent = firstByCall.get(callId);
        return {
          call_id: callId,
          agent_id: event.agent_id,
          agent_name: agent?.name ?? 'Unknown',
          contact_id: event.contact_id,
          contact_name: contact?.full_name ?? 'Unknown',
          phone_number: contact?.phone_number ?? '',
          state: event.state,
          started_at: firstEvent?.event_timestamp ?? event.event_timestamp,
        };
      });

      return reply.send({ calls });
    },
  );
}
