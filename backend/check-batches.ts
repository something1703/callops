import 'dotenv/config';
import { db } from './src/db/index.js';
import { upload_batches } from './src/db/schema.js';
import { desc } from 'drizzle-orm';

async function main() {
  const batches = await db.select().from(upload_batches).orderBy(desc(upload_batches.created_at)).limit(1);
  console.log(batches);
  process.exit(0);
}
main().catch(console.error);
