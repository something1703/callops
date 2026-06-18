/**
 * audit.ts — shared helper used by every route that writes to audit_log.
 * Keeps the writeAudit call out of the route files and centralises the insert.
 *
 * Kept intentionally thin — just a typed wrapper around the Drizzle insert.
 * The important invariant (from AGENT.md): audit inserts happen in the same
 * code path as the action they're logging, never as an afterthought.
 */

import { db } from '../db/index.js';
import { audit_log } from '../db/schema.js';

export async function writeAudit(params: {
  actor_id: string | null;
  action: string;
  target_type?: string;
  target_id?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(audit_log).values({
    actor_id: params.actor_id ?? undefined,
    action: params.action,
    target_type: params.target_type ?? null,
    target_id: params.target_id ?? undefined,
    metadata: params.metadata ?? null,
  });
}
