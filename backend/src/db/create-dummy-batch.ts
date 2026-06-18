import 'dotenv/config';
import { db } from './index.js';
import { upload_batches, users } from './schema.js';

async function main() {
  const [firstUser] = await db.select().from(users).limit(1);
  if (!firstUser) {
    console.error("❌ No users found in database. Please run seed script first.");
    process.exit(1);
  }

  const [batch] = await db
    .insert(upload_batches)
    .values({
      uploaded_by: firstUser.id,
      original_filename: 'mock_contacts.csv',
      status: 'processing',
    })
    .returning();

  console.log(batch.id);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});
