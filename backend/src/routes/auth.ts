import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users, audit_log } from '../db/schema.js';
import { verifyGoogleToken } from '../lib/google-auth.js';
import { signToken } from '../lib/jwt.js';

// ─── Request body schema ──────────────────────────────────────────────────────

const GoogleAuthBodySchema = z.object({
  id_token: z.string().min(1, 'id_token is required'),
});

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/auth/google
   *
   * Accepts a Google ID token (from Google Identity Services / Credential Manager).
   * Verifies it, looks up the user, mints an internal JWT, and writes an audit log entry.
   * Every call — success AND failure — is audit-logged.
   */
  fastify.post(
    '/api/auth/google',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // 1. Parse and validate the request body
      const parseResult = GoogleAuthBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: parseResult.error.errors[0]?.message ?? 'Invalid request body',
        });
      }

      const { id_token } = parseResult.data;
      let actorId: string | null = null;

      try {
        // 2. Verify the Google token (throws on invalid/expired)
        const googlePayload = await verifyGoogleToken(id_token);

        // 3. Look up the user in our database by email
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, googlePayload.email))
          .limit(1);

        // 4a. User not found — we don't auto-create; admins must pre-provision accounts.
        //     Log the failed attempt and reject.
        if (!user) {
          await writeAuditLog({
            actor_id: null,
            action: 'auth.login.failed',
            metadata: {
              reason: 'user_not_found',
              email: googlePayload.email,
            },
          });

          return reply.status(403).send({
            error: 'Forbidden',
            message:
              'Your Google account is not registered in CallOps. Contact an admin to be added.',
          });
        }

        actorId = user.id;

        // 4b. User found but deactivated
        if (!user.is_active) {
          await writeAuditLog({
            actor_id: user.id,
            action: 'auth.login.failed',
            metadata: { reason: 'account_deactivated' },
          });

          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Your account has been deactivated. Contact an admin.',
          });
        }

        // 5. Mint our internal JWT with the user's role embedded
        const token = signToken({
          userId: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        });

        // 6. Update last_login_at
        await db
          .update(users)
          .set({ last_login_at: new Date() })
          .where(eq(users.id, user.id));

        // 7. Write successful login to audit_log — same code path, not an afterthought
        await writeAuditLog({
          actor_id: user.id,
          action: 'auth.login.success',
          metadata: { role: user.role },
        });

        // 8. Return the token and basic user info to the client
        return reply.status(200).send({
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';

        // Log failed auth (e.g., invalid token, domain restriction)
        await writeAuditLog({
          actor_id: actorId,
          action: 'auth.login.failed',
          metadata: { reason: 'exception', message },
        }).catch(() => {
          // Don't let an audit-log failure hide the real error
        });

        // Return a user-facing message that doesn't leak internals
        const isGoogleError =
          message.includes('Token') ||
          message.includes('invalid') ||
          message.includes('expired');

        return reply.status(401).send({
          error: 'Unauthorized',
          message: isGoogleError
            ? 'Google sign-in failed. Please try again.'
            : message,
        });
      }
    }
  );

  /**
   * GET /api/auth/me
   * Returns the current user's profile from the DB (not just from the JWT).
   * Requires a valid Bearer token.
   */
  fastify.get(
    '/api/auth/me',
    {
      preHandler: [
        async (req: FastifyRequest, reply: FastifyReply) => {
          const { authenticate } = await import('../middleware/authenticate.js');
          return authenticate(req, reply);
        },
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          is_active: users.is_active,
          created_at: users.created_at,
          last_login_at: users.last_login_at,
        })
        .from(users)
        .where(eq(users.id, request.user.userId))
        .limit(1);

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send({ user });
    }
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function writeAuditLog(params: {
  actor_id: string | null;
  action: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(audit_log).values({
    actor_id: params.actor_id ?? undefined,
    action: params.action,
    metadata: params.metadata ?? null,
  });
}
