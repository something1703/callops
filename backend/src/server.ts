import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { authRoutes } from './routes/auth.js';
import { uploadRoutes } from './routes/uploads.js';
import { internalRoutes } from './routes/internal.js';
import { contactRoutes } from './routes/contacts.js';
import { datasetRoutes } from './routes/datasets.js';
import { assignmentRoutes } from './routes/assignments.js';
import { userRoutes } from './routes/users.js';
import { callRoutes } from './routes/calls.js';
import { analyticsRoutes } from './routes/analytics.js';

export async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // ─── Plugins ────────────────────────────────────────────────────────────────

  await fastify.register(helmet, {
    // CSP is handled by the admin web (Next.js) — API only needs HSTS etc.
    contentSecurityPolicy: false,
  });

  await fastify.register(cors, {
    // In production, restrict to your actual domain
    origin:
      process.env.NODE_ENV === 'production'
        ? process.env.ALLOWED_ORIGIN ?? false
        : true,
    credentials: true,
  });

  // ─── Health check ───────────────────────────────────────────────────────────

  fastify.get('/health', async (_req, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ─── Routes ─────────────────────────────────────────────────────────────────

  await fastify.register(authRoutes);
  await fastify.register(uploadRoutes);
  await fastify.register(internalRoutes);
  await fastify.register(contactRoutes);
  await fastify.register(datasetRoutes);
  await fastify.register(assignmentRoutes);
  await fastify.register(userRoutes);
  await fastify.register(callRoutes);
  await fastify.register(analyticsRoutes);

  // ─── Global error handler ───────────────────────────────────────────────────

  fastify.setErrorHandler((error, _request, reply) => {
    fastify.log.error(error);

    // Never leak stack traces to clients
    const statusCode = error.statusCode ?? 500;
    return reply.status(statusCode).send({
      error: statusCode === 500 ? 'Internal Server Error' : error.name,
      message:
        statusCode === 500
          ? 'An unexpected error occurred. Please try again.'
          : error.message,
    });
  });

  fastify.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      error: 'Not Found',
      message: 'The requested endpoint does not exist.',
    });
  });

  return fastify;
}
