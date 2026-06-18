/**
 * POST /api/uploads/presign
 * Returns a presigned S3 PUT URL + the batch ID.
 * The client uploads directly to S3 — the file never touches backend memory.
 *
 * POST /api/uploads/batches          — list recent batches for current admin
 * PATCH /api/uploads/batches/:id     — internal: update batch status
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { upload_batches } from '../db/schema.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { writeAudit } from '../lib/audit.js';

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-south-1' });
const BUCKET = process.env.S3_BUCKET!;

const PresignBodySchema = z.object({
  filename: z.string().min(1).max(256),
  content_type: z.string().default('text/csv'),
});

export async function uploadRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/uploads/presign
   * Admin requests a presigned URL to upload a CSV straight to S3.
   * Creates a batch row immediately with status=processing.
   */
  fastify.post(
    '/api/uploads/presign',
    { preHandler: [authenticate, requireRole(['admin', 'team_lead'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parse = PresignBodySchema.safeParse(req.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Bad Request', message: parse.error.errors[0]?.message });
      }

      const { filename, content_type } = parse.data;
      const ext = filename.split('.').pop()?.toLowerCase();
      if (ext !== 'csv') {
        return reply.status(400).send({ error: 'Bad Request', message: 'Only CSV files are accepted.' });
      }

      // Create batch record immediately so the Lambda can reference it
      const [batch] = await db
        .insert(upload_batches)
        .values({
          uploaded_by: req.user.userId,
          original_filename: filename,
          status: 'processing',
        })
        .returning();

      const s3Key = `uploads/${batch.id}/${filename}`;

      let presignedUrl: string;
      try {
        const cmd = new PutObjectCommand({
          Bucket: BUCKET,
          Key: s3Key,
          ContentType: content_type,
          Metadata: {
            batch_id: batch.id,
            uploaded_by: req.user.userId,
          },
        });
        presignedUrl = await getSignedUrl(s3, cmd, { expiresIn: 900 }); // 15 min
      } catch (e) {
        // Roll back batch row if S3 fails
        await db.delete(upload_batches).where(eq(upload_batches.id, batch.id));
        return reply.status(503).send({ error: 'S3 Unavailable', message: 'Could not generate upload URL. Try again.' });
      }

      await writeAudit({
        actor_id: req.user.userId,
        action: 'upload.presign',
        target_type: 'upload_batch',
        target_id: batch.id,
        metadata: { filename, s3Key },
      });

      return reply.status(201).send({
        batch_id: batch.id,
        presigned_url: presignedUrl,
        s3_key: s3Key,
        expires_in_seconds: 900,
      });
    },
  );

  /**
   * GET /api/uploads/batches
   * Returns the 20 most recent batches for this admin.
   */
  fastify.get(
    '/api/uploads/batches',
    { preHandler: [authenticate, requireRole(['admin', 'team_lead'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const batches = await db
        .select()
        .from(upload_batches)
        .where(eq(upload_batches.uploaded_by, req.user.userId))
        .orderBy(desc(upload_batches.created_at))
        .limit(20);

      return reply.send({ batches });
    },
  );
}
