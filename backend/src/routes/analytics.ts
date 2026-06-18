import {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from 'fastify';
import { z } from 'zod';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { eq, gte, and, inArray, count, avg, sum, sql, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { call_events, contacts, assignments, users } from '../db/schema.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-south-1' });
const CALLS_BUCKET = process.env.CALLS_BUCKET!;

// ─────────────────────────────────────────────────────────────────────────────

export async function analyticsRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * GET /api/analytics/summary
   * Dashboard KPI tiles — admin/team_lead only.
   */
  fastify.get(
    '/api/analytics/summary',
    { preHandler: [authenticate, requireRole(['admin', 'team_lead'])] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 7);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [
        totalContactsResult,
        activeAssignmentsResult,
        callsTodayResult,
        callsWeekResult,
        callsMonthResult,
        avgTalkResult,
        totalAgentsResult,
      ] = await Promise.all([
        // Total contacts
        db.select({ count: count() }).from(contacts),
        // Active assignments
        db.select({ count: count() }).from(assignments).where(eq(assignments.status, 'active')),
        // Calls today — distinct call_ids with an ended event today
        db.select({ count: count() }).from(call_events)
          .where(and(
            eq(call_events.state, 'ended' as any),
            gte(call_events.event_timestamp, todayStart),
          )),
        // Calls this week
        db.select({ count: count() }).from(call_events)
          .where(and(
            eq(call_events.state, 'ended' as any),
            gte(call_events.event_timestamp, weekStart),
          )),
        // Calls this month
        db.select({ count: count() }).from(call_events)
          .where(and(
            eq(call_events.state, 'ended' as any),
            gte(call_events.event_timestamp, monthStart),
          )),
        // Average talk duration (seconds) across all ended calls
        db.select({ avg: avg(call_events.talk_duration_seconds) }).from(call_events)
          .where(eq(call_events.state, 'ended' as any)),
        // Total agents
        db.select({ count: count() }).from(users)
          .where(and(eq(users.role, 'agent' as any), eq(users.is_active, true))),
      ]);

      return reply.send({
        total_contacts: totalContactsResult[0]?.count ?? 0,
        active_assignments: activeAssignmentsResult[0]?.count ?? 0,
        calls_today: callsTodayResult[0]?.count ?? 0,
        calls_this_week: callsWeekResult[0]?.count ?? 0,
        calls_this_month: callsMonthResult[0]?.count ?? 0,
        avg_talk_seconds: Math.round(Number(avgTalkResult[0]?.avg ?? 0)),
        total_agents: totalAgentsResult[0]?.count ?? 0,
      });
    },
  );

  /**
   * GET /api/analytics/calls-by-agent
   * Agent leaderboard — admin/team_lead only.
   * ?days=30 (default)
   */
  fastify.get(
    '/api/analytics/calls-by-agent',
    { preHandler: [authenticate, requireRole(['admin', 'team_lead'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const query = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) })
        .parse(req.query);

      const since = new Date();
      since.setDate(since.getDate() - query.days);

      // Get ended events in the window, grouped by agent
      const rows = await db
        .select({
          agent_id: call_events.agent_id,
          call_count: count(call_events.call_id),
          avg_talk_seconds: avg(call_events.talk_duration_seconds),
          total_talk_seconds: sum(call_events.talk_duration_seconds),
        })
        .from(call_events)
        .where(and(
          eq(call_events.state, 'ended' as any),
          gte(call_events.event_timestamp, since),
        ))
        .groupBy(call_events.agent_id)
        .orderBy(desc(count(call_events.call_id)));

      // Fetch agent names
      const agentIds = rows.map((r) => r.agent_id);
      const agentRows = agentIds.length > 0
        ? await db.select().from(users).where(inArray(users.id, agentIds))
        : [];
      const agentMap = new Map(agentRows.map((a) => [a.id, a.name]));

      const leaderboard = rows.map((r, i) => ({
        rank: i + 1,
        agent_id: r.agent_id,
        agent_name: agentMap.get(r.agent_id) ?? 'Unknown',
        call_count: Number(r.call_count),
        avg_talk_seconds: Math.round(Number(r.avg_talk_seconds ?? 0)),
        total_talk_seconds: Number(r.total_talk_seconds ?? 0),
      }));

      return reply.send({ leaderboard, days: query.days });
    },
  );

  /**
   * GET /api/analytics/calls-over-time
   * Daily call volume for the last N days — admin/team_lead only.
   * ?days=30 (default)
   */
  fastify.get(
    '/api/analytics/calls-over-time',
    { preHandler: [authenticate, requireRole(['admin', 'team_lead'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const query = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) })
        .parse(req.query);

      const since = new Date();
      since.setDate(since.getDate() - query.days);

      const rows = await db
        .select({
          date: sql<string>`DATE(${call_events.event_timestamp})`.as('date'),
          call_count: count(call_events.call_id),
          avg_talk_seconds: avg(call_events.talk_duration_seconds),
        })
        .from(call_events)
        .where(and(
          eq(call_events.state, 'ended' as any),
          gte(call_events.event_timestamp, since),
        ))
        .groupBy(sql`DATE(${call_events.event_timestamp})`)
        .orderBy(sql`DATE(${call_events.event_timestamp})`);

      return reply.send({
        series: rows.map((r) => ({
          date: r.date,
          call_count: Number(r.call_count),
          avg_talk_seconds: Math.round(Number(r.avg_talk_seconds ?? 0)),
        })),
        days: query.days,
      });
    },
  );

  /**
   * GET /api/analytics/recent-calls
   * Paginated call history for the Calls page — admin/team_lead only.
   */
  fastify.get(
    '/api/analytics/recent-calls',
    { preHandler: [authenticate, requireRole(['admin', 'team_lead'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const query = z.object({
        page: z.coerce.number().int().min(1).default(1),
        per_page: z.coerce.number().int().min(1).max(100).default(50),
      }).parse(req.query);

      const offset = (query.page - 1) * query.per_page;

      // Get the ended/failed events (one per call)
      const rows = await db
        .select()
        .from(call_events)
        .where(inArray(call_events.state, ['ended', 'failed'] as any[]))
        .orderBy(desc(call_events.event_timestamp))
        .limit(query.per_page)
        .offset(offset);

      const agentIds = [...new Set(rows.map((r) => r.agent_id))];
      const contactIds = [...new Set(rows.map((r) => r.contact_id))];

      const [agentRows, contactRows] = await Promise.all([
        agentIds.length > 0 ? db.select().from(users).where(inArray(users.id, agentIds)) : [],
        contactIds.length > 0 ? db.select().from(contacts).where(inArray(contacts.id, contactIds)) : [],
      ]);

      const agentMap = new Map(agentRows.map((a) => [a.id, a.name]));
      const contactMap = new Map(contactRows.map((c) => [c.id, { name: c.full_name, phone: c.phone_number }]));

      const calls = rows.map((r) => ({
        call_id: r.call_id,
        agent_id: r.agent_id,
        agent_name: agentMap.get(r.agent_id) ?? 'Unknown',
        contact_id: r.contact_id,
        contact_name: contactMap.get(r.contact_id)?.name ?? 'Unknown',
        phone_number: contactMap.get(r.contact_id)?.phone ?? '',
        state: r.state,
        ended_at: r.event_timestamp,
        talk_duration_seconds: r.talk_duration_seconds,
        ring_duration_seconds: r.ring_duration_seconds,
        has_recording: !!r.recording_s3_key,
      }));

      return reply.send({ calls, page: query.page, per_page: query.per_page });
    },
  );

  /**
   * GET /api/analytics/recording/:call_id/presign
   * Returns a 15-minute presigned S3 GET URL for a call recording.
   * Admin/team_lead only. Never returns the raw S3 key.
   */
  fastify.get(
    '/api/analytics/recording/:call_id/presign',
    { preHandler: [authenticate, requireRole(['admin', 'team_lead'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { call_id } = req.params as { call_id: string };

      // Find the recording key from any event for this call
      const [event] = await db
        .select({ recording_s3_key: call_events.recording_s3_key })
        .from(call_events)
        .where(and(
          eq(call_events.call_id, call_id),
          sql`${call_events.recording_s3_key} IS NOT NULL`,
        ))
        .limit(1);

      if (!event?.recording_s3_key) {
        return reply.status(404).send({ error: 'Not Found', message: 'No recording found for this call.' });
      }

      try {
        const url = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: CALLS_BUCKET, Key: event.recording_s3_key }),
          { expiresIn: 15 * 60 }, // 15 minutes
        );
        return reply.send({ url, expires_in_seconds: 900 });
      } catch (err) {
        fastify.log.error({ err, call_id }, 'Failed to generate presigned URL for recording');
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Could not generate playback URL.' });
      }
    },
  );

  /**
   * GET /api/analytics/audit-log
   * Recent audit log entries — admin only.
   */
  fastify.get(
    '/api/analytics/audit-log',
    { preHandler: [authenticate, requireRole(['admin'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const query = z.object({
        page: z.coerce.number().int().min(1).default(1),
        per_page: z.coerce.number().int().min(1).max(100).default(50),
      }).parse(req.query);

      const offset = (query.page - 1) * query.per_page;

      const { audit_log } = await import('../db/schema.js');

      const rows = await db
        .select()
        .from(audit_log)
        .orderBy(desc(audit_log.created_at))
        .limit(query.per_page)
        .offset(offset);

      // Enrich with actor names
      const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
      const actorRows = actorIds.length > 0
        ? await db.select().from(users).where(inArray(users.id, actorIds))
        : [];
      const actorMap = new Map(actorRows.map((a) => [a.id, a.name]));

      return reply.send({
        entries: rows.map((r) => ({
          id: r.id,
          actor_name: r.actor_id ? (actorMap.get(r.actor_id) ?? 'System') : 'System',
          action: r.action,
          target_type: r.target_type,
          target_id: r.target_id,
          metadata: r.metadata,
          created_at: r.created_at,
        })),
        page: query.page,
        per_page: query.per_page,
      });
    },
  );
}
