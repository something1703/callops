/**
 * POST /api/uploads/presign   — get a presigned S3 PUT URL + batch ID
 * POST /api/uploads/process   — after S3 upload, trigger backend ETL processing
 * GET  /api/uploads/batches   — list recent batches for current admin
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import { eq, desc, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { upload_batches, contacts } from '../db/schema.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { writeAudit } from '../lib/audit.js';

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-south-1' });
const BUCKET = process.env.S3_BUCKET!;

const PresignBodySchema = z.object({
  filename: z.string().min(1).max(256),
  content_type: z.string().default('text/csv'),
});

const ProcessBodySchema = z.object({
  batch_id: z.string().uuid(),
  s3_key: z.string().min(1),
});

// ─── Phone normalization (mirrors Python ETL logic) ──────────────────────────

function cleanPhone(raw: string, defaultCountryCode = '+91'): string | null {
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);
  if (cleaned.length === 10) return defaultCountryCode + cleaned;
  if (cleaned.length === 12 && cleaned.startsWith('91')) return '+' + cleaned;
  return '+' + cleaned;
}

// ─── CSV parser (handles quoted commas) ──────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ─── Route plugin ─────────────────────────────────────────────────────────────

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
          Metadata: { batch_id: batch.id, uploaded_by: req.user.userId },
        });
        presignedUrl = await getSignedUrl(s3, cmd, { expiresIn: 900 });
      } catch (_e) {
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
   * POST /api/uploads/process
   *
   * Called by the frontend AFTER it finishes uploading to S3.
   * The backend downloads the CSV from S3, runs ETL cleaning inline
   * (phone normalization, validation, dedup), inserts into DB,
   * and marks the batch completed — all in one synchronous response.
   *
   * This replaces the AWS Lambda trigger — no Lambda deployment needed.
   */
  fastify.post(
    '/api/uploads/process',
    {
      preHandler: [authenticate, requireRole(['admin', 'team_lead'])],
      config: { rawBody: false },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parse = ProcessBodySchema.safeParse(req.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Bad Request', message: parse.error.errors[0]?.message });
      }

      const { batch_id, s3_key } = parse.data;

      // Verify batch belongs to this user
      const [batch] = await db
        .select()
        .from(upload_batches)
        .where(eq(upload_batches.id, batch_id))
        .limit(1);

      if (!batch) return reply.status(404).send({ error: 'Not Found', message: 'Batch not found.' });
      if (batch.uploaded_by !== req.user.userId) {
        return reply.status(403).send({ error: 'Forbidden', message: 'This batch does not belong to you.' });
      }

      const markFailed = async (reason: string) => {
        await db.update(upload_batches).set({ status: 'failed' }).where(eq(upload_batches.id, batch_id));
        await writeAudit({
          actor_id: req.user.userId,
          action: 'upload.ingest.failed',
          target_type: 'upload_batch',
          target_id: batch_id,
          metadata: { reason },
        });
      };

      // ── Step 1: Download CSV from S3 ──────────────────────────────────────
      let csvText: string;
      try {
        const getCmd = new GetObjectCommand({ Bucket: BUCKET, Key: s3_key });
        const s3Resp = await s3.send(getCmd);
        const chunks: Uint8Array[] = [];
        for await (const chunk of s3Resp.Body as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
        }
        csvText = Buffer.concat(chunks).toString('utf-8');
      } catch (e: any) {
        await markFailed(`S3 download error: ${e?.message}`);
        return reply.status(502).send({ error: 'S3 Error', message: 'Could not download file from S3. Ensure the upload completed successfully.' });
      }

      // ── Step 2: Parse CSV ──────────────────────────────────────────────────
      const lines = csvText.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        await markFailed('CSV has no data rows');
        return reply.status(422).send({ error: 'Invalid CSV', message: 'CSV must have a header row and at least one data row.' });
      }

      const headers = parseCSVLine(lines[0]).map((h) =>
        h.toLowerCase().replace(/[\s\-]/g, '_'),
      );

      const colIdx = (...candidates: string[]) => {
        for (const c of candidates) {
          const i = headers.indexOf(c);
          if (i !== -1) return i;
        }
        return -1;
      };

      const nameIdx   = colIdx('full_name', 'fullname', 'name');
      const phoneIdx  = colIdx('phone_number', 'phone', 'phonenumber', 'mobile');
      const regionIdx = colIdx('region', 'state', 'city');
      const tagsIdx   = colIdx('tags', 'tag', 'category');

      if (nameIdx === -1 || phoneIdx === -1) {
        await markFailed(`Missing required columns. Found: ${headers.join(', ')}`);
        return reply.status(422).send({
          error: 'Invalid CSV',
          message: `CSV must have 'full_name' and 'phone_number' columns. Found: ${headers.join(', ')}`,
        });
      }

      // ── Step 3: Clean rows ─────────────────────────────────────────────────
      type CleanRow = { full_name: string; phone_number: string; region: string | null; tags: string[] };
      const cleanedRows: CleanRow[] = [];
      const seenPhones = new Set<string>();
      let skippedInvalid = 0;

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const rawName  = cols[nameIdx]?.trim() ?? '';
        const rawPhone = cols[phoneIdx]?.trim() ?? '';

        if (!rawName || !rawPhone) { skippedInvalid++; continue; }

        const phone = cleanPhone(rawPhone);
        if (!phone || phone.length < 5 || phone.length > 30) { skippedInvalid++; continue; }
        if (seenPhones.has(phone)) { skippedInvalid++; continue; }
        seenPhones.add(phone);

        const region = regionIdx !== -1 ? (cols[regionIdx]?.trim() || null) : null;
        const tags   = tagsIdx   !== -1
          ? (cols[tagsIdx] ?? '').split(',').map((t) => t.trim()).filter(Boolean)
          : [];

        cleanedRows.push({
          full_name:    rawName.slice(0, 500),
          phone_number: phone,
          region:       region?.slice(0, 200) ?? null,
          tags,
        });
      }

      if (cleanedRows.length === 0) {
        await markFailed(`No valid contacts after cleaning. Skipped ${skippedInvalid} invalid rows.`);
        return reply.status(422).send({
          error: 'No Valid Rows',
          message: `No valid contacts found after cleaning. ${skippedInvalid} rows were skipped (missing name/phone or invalid number).`,
        });
      }

      // ── Step 4: Dedup against existing DB ─────────────────────────────────
      const incomingPhones = cleanedRows.map((r) => r.phone_number);
      const existing = await db
        .select({ phone_number: contacts.phone_number })
        .from(contacts)
        .where(inArray(contacts.phone_number, incomingPhones));

      const existingPhones = new Set(existing.map((e) => e.phone_number));
      const newRows        = cleanedRows.filter((r) => !existingPhones.has(r.phone_number));
      const dupCount       = cleanedRows.length - newRows.length;

      // ── Step 5: Insert in chunks of 500 ───────────────────────────────────
      let insertedCount = 0;
      const CHUNK = 500;
      for (let i = 0; i < newRows.length; i += CHUNK) {
        const chunk = newRows.slice(i, i + CHUNK);
        const inserted = await db
          .insert(contacts)
          .values(
            chunk.map((r) => ({
              full_name:       r.full_name,
              phone_number:    r.phone_number,
              region:          r.region,
              tags:            r.tags,
              source_batch_id: batch_id,
            })),
          )
          .returning({ id: contacts.id });
        insertedCount += inserted.length;
      }

      // ── Step 6: Mark batch completed ──────────────────────────────────────
      await db.update(upload_batches)
        .set({ status: 'completed', row_count: cleanedRows.length })
        .where(eq(upload_batches.id, batch_id));

      await writeAudit({
        actor_id: req.user.userId,
        action: 'upload.ingest.completed',
        target_type: 'upload_batch',
        target_id: batch_id,
        metadata: {
          total_row_count: cleanedRows.length,
          inserted: insertedCount,
          skipped_invalid: skippedInvalid,
          skipped_duplicates: dupCount,
        },
      });

      return reply.send({
        batch_id,
        status: 'completed',
        total_rows_in_csv: lines.length - 1,
        valid_rows: cleanedRows.length,
        inserted: insertedCount,
        skipped_invalid: skippedInvalid,
        skipped_duplicates: dupCount,
      });
    },
  );

  /**
   * GET /api/uploads/batches
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
