/**
 * GET /api/contacts
 * Paginated contact list with optional filters.
 * Admin/team_lead only — agents get their contacts via /api/assignments/mine.
 *
 * Query params:
 *   page          (default 1)
 *   per_page      (default 50, max 200)
 *   status        contact_status enum value
 *   region        text filter (ILIKE)
 *   tag           single tag to filter by (contacts whose tags @> ARRAY[tag])
 *   q             full-text search on full_name or phone_number
 *
 * PATCH /api/contacts/:id/status  — update a single contact's status
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, ilike, sql, desc, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { contacts } from '../db/schema.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { writeAudit } from '../lib/audit.js';

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(200).default(50),
  status: z.string().optional(),
  region: z.string().optional(),
  tag: z.string().optional(),
  q: z.string().optional(),
});

const StatusPatchSchema = z.object({
  status: z.enum(['new', 'contacted', 'interested', 'not_interested', 'converted', 'do_not_call']),
});

export async function contactRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/contacts
   */
  fastify.get(
    '/api/contacts',
    { preHandler: [authenticate, requireRole(['admin', 'team_lead'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const q = QuerySchema.safeParse(req.query);
      if (!q.success) {
        return reply.status(400).send({ error: 'Bad Request', message: q.error.errors[0]?.message });
      }

      const { page, per_page, status, region, tag, q: search } = q.data;
      const offset = (page - 1) * per_page;

      // Build dynamic WHERE conditions
      const conditions: ReturnType<typeof eq>[] = [];

      if (status) {
        conditions.push(eq(contacts.status, status as any));
      }
      if (region) {
        conditions.push(ilike(contacts.region, `%${region}%`));
      }
      if (tag) {
        // PostgreSQL: tags @> ARRAY['tag'] — array contains
        conditions.push(sql`${contacts.tags} @> ARRAY[${tag}]::text[]`);
      }
      if (search) {
        conditions.push(
          or(
            ilike(contacts.full_name, `%${search}%`),
            ilike(contacts.phone_number, `%${search}%`),
          )!,
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      // Total count for pagination (separate efficient COUNT query)
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(contacts)
        .where(where);

      const rows = await db
        .select()
        .from(contacts)
        .where(where)
        .orderBy(desc(contacts.created_at))
        .limit(per_page)
        .offset(offset);

      return reply.send({
        data: rows,
        meta: {
          total: count,
          page,
          per_page,
          total_pages: Math.ceil(count / per_page),
        },
      });
    },
  );

  /**
   * PATCH /api/contacts/:id/status
   * Lets admin/team_lead update a contact's status.
   */
  fastify.patch(
    '/api/contacts/:id/status',
    { preHandler: [authenticate, requireRole(['admin', 'team_lead'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const parse = StatusPatchSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Bad Request', message: parse.error.errors[0]?.message });
      }

      const [updated] = await db
        .update(contacts)
        .set({ status: parse.data.status, updated_at: new Date() })
        .where(eq(contacts.id, id))
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: 'Not Found', message: 'Contact not found.' });
      }

      await writeAudit({
        actor_id: req.user.userId,
        action: 'contact.status.updated',
        target_type: 'contact',
        target_id: id,
        metadata: { new_status: parse.data.status },
      });

      return reply.send({ contact: updated });
    },
  );
}
