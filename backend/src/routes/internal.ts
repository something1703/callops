/**
 * POST /internal/ingest
 *
 * Called exclusively by the ETL Lambda after it cleans and dedupes a CSV.
 * Protected by SERVICE_TO_SERVICE_SECRET header — not by JWT.
 *
 * Accepts batches of cleaned contact rows, bulk-inserts them, and dedupes
 * on phone_number by skipping rows whose number already exists.
 * Updates the upload_batch status to completed/failed when done.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { contacts, upload_batches } from '../db/schema.js';
import { writeAudit } from '../lib/audit.js';

const ContactRowSchema = z.object({
  full_name: z.string().min(1).max(500),
  phone_number: z.string().min(5).max(30),
  region: z.string().max(200).optional(),
  tags: z.array(z.string()).default([]),
});

const IngestBodySchema = z.object({
  batch_id: z.string().uuid(),
  rows: z.array(ContactRowSchema).min(1).max(1000),
  is_final: z.boolean().default(false), // true on last chunk of this batch
  total_row_count: z.number().int().optional(), // only needed when is_final=true
});

export async function internalRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * Middleware: check SERVICE_TO_SERVICE_SECRET header.
   * No JWT here — this endpoint is not user-facing.
   */
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.url.startsWith('/internal/')) return;
    const secret = req.headers['x-service-secret'];
    const expected = process.env.SERVICE_TO_SERVICE_SECRET;
    if (!expected || secret !== expected) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid service secret.' });
    }
  });

  fastify.post(
    '/internal/ingest',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parse = IngestBodySchema.safeParse(req.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Bad Request', message: parse.error.errors[0]?.message });
      }

      const { batch_id, rows, is_final, total_row_count } = parse.data;

      // Verify the batch exists
      const [batch] = await db
        .select()
        .from(upload_batches)
        .where(eq(upload_batches.id, batch_id))
        .limit(1);

      if (!batch) {
        return reply.status(404).send({ error: 'Not Found', message: `Batch ${batch_id} not found.` });
      }

      // Collect phone numbers in this chunk to check for existing contacts (soft dedup)
      const incomingPhones = rows.map((r) => r.phone_number);

      const existing = await db
        .select({ phone_number: contacts.phone_number })
        .from(contacts)
        .where(inArray(contacts.phone_number, incomingPhones));

      const existingPhones = new Set(existing.map((e) => e.phone_number));

      // Filter out dupes — skip, don't error the whole batch
      const newRows = rows.filter((r) => !existingPhones.has(r.phone_number));

      let insertedCount = 0;
      if (newRows.length > 0) {
        const inserted = await db
          .insert(contacts)
          .values(
            newRows.map((r) => ({
              full_name: r.full_name,
              phone_number: r.phone_number,
              region: r.region ?? null,
              tags: r.tags,
              source_batch_id: batch_id,
            })),
          )
          .returning({ id: contacts.id });
        insertedCount = inserted.length;
      }

      const skippedCount = rows.length - insertedCount;

      // If this is the final chunk, mark batch as completed and write audit
      if (is_final) {
        await db
          .update(upload_batches)
          .set({
            status: 'completed',
            row_count: total_row_count ?? rows.length,
          })
          .where(eq(upload_batches.id, batch_id));

        await writeAudit({
          actor_id: null, // Lambda, not a user
          action: 'upload.ingest.completed',
          target_type: 'upload_batch',
          target_id: batch_id,
          metadata: {
            total_row_count,
            inserted: insertedCount,
            skipped_duplicates: skippedCount,
          },
        });
      }

      return reply.status(200).send({
        batch_id,
        inserted: insertedCount,
        skipped_duplicates: skippedCount,
        is_final,
      });
    },
  );

  /**
   * PATCH /internal/ingest/fail
   * Called by Lambda when parsing fails entirely (malformed CSV, etc.)
   */
  fastify.patch(
    '/internal/ingest/fail',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { batch_id, reason } = req.body as { batch_id: string; reason: string };
      if (!batch_id) return reply.status(400).send({ error: 'batch_id required' });

      await db
        .update(upload_batches)
        .set({ status: 'failed' })
        .where(eq(upload_batches.id, batch_id));

      await writeAudit({
        actor_id: null,
        action: 'upload.ingest.failed',
        target_type: 'upload_batch',
        target_id: batch_id,
        metadata: { reason },
      });

      return reply.send({ ok: true });
    },
  );
}
