import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env and fill it in.'
  );
}

const sql = neon(connectionString);

/**
 * db is the single shared Drizzle client for the entire backend.
 * Uses Neon's HTTP driver — no persistent TCP connection, safe for serverless
 * but also perfectly fine for a long-running Fastify server.
 */
export const db = drizzle(sql, { schema });
