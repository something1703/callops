/**
 * GET /api/users        — list active users (admin sees all; team_lead sees agents only)
 * GET /api/users/agents — shorthand: only users with role=agent
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, ne, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/users',
    { preHandler: [authenticate, requireRole(['admin', 'team_lead'])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const isAdmin = req.user.role === 'admin';

      const rows = await db
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
        .where(
          isAdmin
            ? eq(users.is_active, true)                       // admin sees everyone active
            : and(eq(users.is_active, true), eq(users.role, 'agent')), // team_lead sees only agents
        );

      return reply.send({ users: rows });
    },
  );

  fastify.get(
    '/api/users/agents',
    { preHandler: [authenticate, requireRole(['admin', 'team_lead'])] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const agents = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          is_active: users.is_active,
        })
        .from(users)
        .where(
          and(
            eq(users.role, 'agent'),
            eq(users.is_active, true)
          )
        );

      return reply.send({ agents });
    },
  );
}
