import 'dotenv/config';
import { db } from './src/db/index.js';
import { users } from './src/db/schema.js';

async function main() {
  await db.insert(users).values({
    google_sub: 'temp_sub_for_tejasvi',
    email: 'tejasvikesarwani2213@gmail.com',
    name: 'Tejasvi Kesarwani',
    role: 'agent',
    is_active: true,
  });
  console.log("Agent Tejasvi added!");
  process.exit(0);
}
main().catch(console.error);
