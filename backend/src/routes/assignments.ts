/**
 * POST /api/assignments        — assign a dataset to one or more agents
 * GET  /api/assignments        — list all assignments (admin/team_lead)
 * GET  /api/assignments/mine   — agent's own active assigned contacts
 * PATCH /api/assignments/:id   — reassign or mark completed
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { assignments, dataset_contacts, contacts, users } from '../db/schema.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { writeAudit } from '../lib/audit.js';

const AssignSchema = z.object({
  dataset_id: z.string().uuid(),
  agent_ids: z.array(z.string().uuid()).min(1).max(50),
  // 'even' splits the dataset evenly across agents; 'all' gives every contact to all agents
  distribution: z.enum(['even', 'all']).default('even'),
});

export async function assignmentRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/assignments
   * Picks all contacts from dataset_contacts, distributes them to agents,
   * and bulk-inserts rows into assignments. Fully audit-logged.
   */
  fastify.post(
    '/api/assignments',
    { preHandler: [authenticate, requireRole(['admin', 'team_lead'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parse = AssignSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Bad Request', message: parse.error.errors[0]?.message });
      }

      const { dataset_id, agent_ids, distribution } = parse.data;

      // Verify all agent_ids are real active agents
      const agents = await db
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.id, agent_ids), eq(users.is_active, true)));

      if (agents.length !== agent_ids.length) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'One or more agent IDs are invalid or inactive.',
        });
      }

      // Pull all contact IDs from the dataset
      const dcRows = await db
        .select({ contact_id: dataset_contacts.contact_id })
        .from(dataset_contacts)
        .where(eq(dataset_contacts.dataset_id, dataset_id));

      if (dcRows.length === 0) {
        return reply.status(400).send({
          error: 'Empty Dataset',
          message: 'Dataset has no contacts.',
        });
      }

      const contactIds = dcRows.map((r) => r.contact_id);
      const agentCount = agents.length;
      const assignedBy = req.user.userId;

      // Build assignment rows based on distribution strategy
      const rows: { contact_id: string; agent_id: string; assigned_by: string }[] = [];

      if (distribution === 'all') {
        // Every agent gets every contact
        for (const contactId of contactIds) {
          for (const agent of agents) {
            rows.push({ contact_id: contactId, agent_id: agent.id, assigned_by: assignedBy });
          }
        }
      } else {
        // Even split: round-robin
        contactIds.forEach((contactId, idx) => {
          const agent = agents[idx % agentCount];
          rows.push({ contact_id: contactId, agent_id: agent.id, assigned_by: assignedBy });
        });
      }

      // Bulk insert in chunks of 500 to avoid query size limits
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await db.insert(assignments).values(rows.slice(i, i + CHUNK));
      }

      await writeAudit({
        actor_id: assignedBy,
        action: 'assignment.created',
        target_type: 'dataset',
        target_id: dataset_id,
        metadata: {
          dataset_id,
          agent_ids,
          distribution,
          total_assignments: rows.length,
          contacts_in_dataset: contactIds.length,
        },
      });

      return reply.status(201).send({
        assigned: rows.length,
        contacts: contactIds.length,
        agents: agentCount,
        distribution,
      });
    },
  );

  /**
   * GET /api/assignments
   * Full list for admin — paginated, most recent first.
   */
  fastify.get(
    '/api/assignments',
    { preHandler: [authenticate, requireRole(['admin', 'team_lead'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { page = '1', per_page = '50' } = req.query as Record<string, string>;
      const pageNum = Math.max(1, parseInt(page, 10));
      const perPage = Math.min(200, Math.max(1, parseInt(per_page, 10)));
      const offset = (pageNum - 1) * perPage;

      const rows = await db
        .select({
          id: assignments.id,
          contact_id: assignments.contact_id,
          agent_id: assignments.agent_id,
          assigned_by: assignments.assigned_by,
          status: assignments.status,
          assigned_at: assignments.assigned_at,
          // Join contact info
          contact_full_name: contacts.full_name,
          contact_phone: contacts.phone_number,
          contact_status: contacts.status,
          // Join agent info
          agent_name: users.name,
          agent_email: users.email,
        })
        .from(assignments)
        .innerJoin(contacts, eq(assignments.contact_id, contacts.id))
        .innerJoin(users, eq(assignments.agent_id, users.id))
        .orderBy(desc(assignments.assigned_at))
        .limit(perPage)
        .offset(offset);

      return reply.send({ assignments: rows, page: pageNum, per_page: perPage });
    },
  );

  /**
   * GET /api/assignments/mine
   * Returns only the calling agent's active assigned contacts.
   * The agent_id filter comes ONLY from the verified JWT — never from the client.
   */
  fastify.get(
    '/api/assignments/mine',
    { preHandler: [authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const agentId = req.user.userId; // from JWT — never trust client

      const rows = await db
        .select({
          assignment_id: assignments.id,
          assigned_at: assignments.assigned_at,
          // Contact fields — only expose what the agent needs
          id: contacts.id,
          full_name: contacts.full_name,
          phone_number: contacts.phone_number,
          region: contacts.region,
          status: contacts.status,
          tags: contacts.tags,
        })
        .from(assignments)
        .innerJoin(contacts, eq(assignments.contact_id, contacts.id))
        .where(
          and(
            eq(assignments.agent_id, agentId),
            eq(assignments.status, 'active'),
          ),
        )
        .orderBy(desc(assignments.assigned_at));

      return reply.send({ contacts: rows });
    },
  );

  /**
   * PATCH /api/assignments/:id
   * Reassign or mark completed. Admin/team_lead only.
   */
  fastify.patch(
    '/api/assignments/:id',
    { preHandler: [authenticate, requireRole(['admin', 'team_lead'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const { status, new_agent_id } = req.body as { status?: string; new_agent_id?: string };

      if (!status && !new_agent_id) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Provide status or new_agent_id.' });
      }

      const updates: Partial<{ status: any; agent_id: string }> = {};
      if (status) updates.status = status;
      if (new_agent_id) {
        updates.agent_id = new_agent_id;
        updates.status = 'active';
      }

      const [updated] = await db
        .update(assignments)
        .set(updates)
        .where(eq(assignments.id, id))
        .returning();

      if (!updated) return reply.status(404).send({ error: 'Not Found', message: 'Assignment not found.' });

      await writeAudit({
        actor_id: req.user.userId,
        action: 'assignment.updated',
        target_type: 'assignment',
        target_id: id,
        metadata: updates,
      });

      return reply.send({ assignment: updated });
    },
  );
}
