/**
 * POST /api/datasets          — build a named dataset from a filter
 * GET  /api/datasets          — list all datasets (admin/team_lead)
 * GET  /api/datasets/:id      — get one dataset + its contacts (paginated)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and, ilike, sql, desc, or, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { contacts, datasets, dataset_contacts } from '../db/schema.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { writeAudit } from '../lib/audit.js';

const BuildDatasetSchema = z.object({
  name: z.string().min(1).max(200),
  filters: z.object({
    status: z.string().optional(),
    region: z.string().optional(),
    tag: z.string().optional(),
    q: z.string().optional(),
  }).default({}),
});

export async function datasetRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/datasets
   * Runs the filter against the contacts table, snapshots matching IDs,
   * inserts them into dataset_contacts. Immutable once built.
   */
  fastify.post(
    '/api/datasets',
    { preHandler: [authenticate, requireRole(['admin', 'team_lead'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parse = BuildDatasetSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Bad Request', message: parse.error.errors[0]?.message });
      }

      const { name, filters } = parse.data;

      // Build WHERE conditions from filters
      const conditions: ReturnType<typeof eq>[] = [];
      if (filters.status) conditions.push(eq(contacts.status, filters.status as any));
      if (filters.region) conditions.push(ilike(contacts.region, `%${filters.region}%`));
      if (filters.tag)    conditions.push(sql`${contacts.tags} @> ARRAY[${filters.tag}]::text[]`);
      if (filters.q) {
        conditions.push(or(
          ilike(contacts.full_name, `%${filters.q}%`),
          ilike(contacts.phone_number, `%${filters.q}%`),
        )!);
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      // Fetch matching IDs — no LIMIT; this is the full snapshot
      const matchingContacts = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(where);

      if (matchingContacts.length === 0) {
        return reply.status(400).send({
          error: 'Empty Dataset',
          message: 'No contacts match the given filters. Adjust your filters and try again.',
        });
      }

      // Create the dataset row
      const [dataset] = await db
        .insert(datasets)
        .values({
          name,
          created_by: req.user.userId,
          filter_params: filters,
          contact_count: matchingContacts.length,
        })
        .returning();

      // Bulk-insert dataset_contacts rows
      await db.insert(dataset_contacts).values(
        matchingContacts.map((c) => ({
          dataset_id: dataset.id,
          contact_id: c.id,
        })),
      );

      await writeAudit({
        actor_id: req.user.userId,
        action: 'dataset.created',
        target_type: 'dataset',
        target_id: dataset.id,
        metadata: { name, contact_count: matchingContacts.length, filters },
      });

      return reply.status(201).send({ dataset });
    },
  );

  /**
   * GET /api/datasets
   */
  fastify.get(
    '/api/datasets',
    { preHandler: [authenticate, requireRole(['admin', 'team_lead'])] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const rows = await db
        .select()
        .from(datasets)
        .orderBy(desc(datasets.created_at))
        .limit(100);

      return reply.send({ datasets: rows });
    },
  );

  /**
   * GET /api/datasets/:id
   * Returns the dataset metadata + paginated contact list from dataset_contacts.
   */
  fastify.get(
    '/api/datasets/:id',
    { preHandler: [authenticate, requireRole(['admin', 'team_lead'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const { page = '1', per_page = '50' } = req.query as Record<string, string>;
      const pageNum = Math.max(1, parseInt(page, 10));
      const perPage = Math.min(200, Math.max(1, parseInt(per_page, 10)));
      const offset = (pageNum - 1) * perPage;

      const [dataset] = await db
        .select()
        .from(datasets)
        .where(eq(datasets.id, id))
        .limit(1);

      if (!dataset) {
        return reply.status(404).send({ error: 'Not Found', message: 'Dataset not found.' });
      }

      // Get paginated contact IDs for this dataset
      const dcRows = await db
        .select({ contact_id: dataset_contacts.contact_id })
        .from(dataset_contacts)
        .where(eq(dataset_contacts.dataset_id, id))
        .limit(perPage)
        .offset(offset);

      let contactRows: any[] = [];
      if (dcRows.length > 0) {
        contactRows = await db
          .select()
          .from(contacts)
          .where(inArray(contacts.id, dcRows.map((r) => r.contact_id)));
      }

      return reply.send({
        dataset,
        contacts: contactRows,
        meta: {
          total: dataset.contact_count,
          page: pageNum,
          per_page: perPage,
          total_pages: Math.ceil(dataset.contact_count / perPage),
        },
      });
    },
  );
}
