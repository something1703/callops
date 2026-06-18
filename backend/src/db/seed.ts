/**
 * seed.ts — creates the first admin user in the database.
 *
 * Run ONCE after the schema migration:
 *   npm run db:seed
 *
 * Usage:
 *   SEED_ADMIN_EMAIL=you@gmail.com \
 *   SEED_ADMIN_NAME="Your Name" \
 *   SEED_ADMIN_GOOGLE_SUB="your-google-sub-id" \
 *   npm run db:seed
 *
 * To find your Google sub ID: sign in to https://accounts.google.com
 * and look at the "sub" field in the ID token, or temporarily log it
 * in the auth route before running the real seed.
 *
 * If no env vars are provided, prompts are printed and the script exits.
 */

import 'dotenv/config';
import { db } from './index.js';
import { users } from './schema.js';
import { eq } from 'drizzle-orm';

async function seed() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const name = process.env.SEED_ADMIN_NAME;
  const googleSub = process.env.SEED_ADMIN_GOOGLE_SUB;

  if (!email || !name || !googleSub) {
    console.error(`
╔══════════════════════════════════════════════════════════════════╗
║  CallOps — Admin Seeder                                          ║
╠══════════════════════════════════════════════════════════════════╣
║  Missing required env vars. Run with:                            ║
║                                                                  ║
║  SEED_ADMIN_EMAIL=you@gmail.com \\                               ║
║  SEED_ADMIN_NAME="Your Name" \\                                  ║
║  SEED_ADMIN_GOOGLE_SUB="123456789" \\                            ║
║  npm run db:seed                                                 ║
║                                                                  ║
║  To find your Google sub:                                        ║
║  1. Sign in to the admin web app                                 ║
║  2. Temporarily log payload.sub in backend/src/routes/auth.ts    ║
║     inside verifyGoogleToken() before the users table lookup     ║
║  3. Copy the printed sub, run this script, remove the log line   ║
╚══════════════════════════════════════════════════════════════════╝
    `);
    process.exit(1);
  }

  // Check if user already exists
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    console.log(`✓ Admin user already exists: ${email} (role: ${existing[0].role})`);
    process.exit(0);
  }

  const [created] = await db
    .insert(users)
    .values({
      google_sub: googleSub,
      email,
      name,
      role: 'admin',
      is_active: true,
    })
    .returning();

  console.log(`\n✅ Admin user created successfully!`);
  console.log(`   ID:    ${created.id}`);
  console.log(`   Email: ${created.email}`);
  console.log(`   Role:  ${created.role}`);
  console.log(`\nYou can now sign in to the admin web app at http://localhost:3000\n`);

  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
