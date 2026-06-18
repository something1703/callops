/**
 * requireRole — Fastify preHandler middleware.
 * Must be used AFTER `authenticate` (which populates req.user).
 *
 * Usage:
 *   { preHandler: [authenticate, requireRole(['admin', 'team_lead'])] }
 */

import { FastifyRequest, FastifyReply } from 'fastify';

export function requireRole(allowed: string[]) {
  return async function (req: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!req.user) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required.' });
    }

    if (!allowed.includes(req.user.role)) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: `This action requires one of the following roles: ${allowed.join(', ')}.`,
      });
    }
  };
}
