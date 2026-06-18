import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, type JwtPayload } from '../lib/jwt.js';

// Augment FastifyRequest so TypeScript knows about req.user everywhere
declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload;
  }
}

/**
 * authenticate
 * Fastify preHandler hook — extracts and verifies the Bearer JWT.
 * Attach as `preHandler: [authenticate]` on any protected route.
 *
 * Security: the JWT is the only source of truth for userId and role —
 * we never trust a client-supplied userId in the request body/params.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header. Expected: Bearer <token>',
    });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    request.user = verifyToken(token);
  } catch {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Token is invalid or has expired. Please sign in again.',
    });
  }
}

/**
 * requireRole
 * Factory that returns a preHandler enforcing a minimum role.
 * Use after `authenticate` in the preHandler chain.
 *
 * Example: preHandler: [authenticate, requireRole('admin')]
 */
export function requireRole(
  ...roles: Array<'admin' | 'team_lead' | 'agent'>
) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: `This action requires one of the following roles: ${roles.join(', ')}.`,
      });
    }
  };
}
