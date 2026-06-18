import 'dotenv/config';
import { buildServer } from './server.js';

const PORT = parseInt(process.env.PORT ?? '4000', 10);
const HOST = '0.0.0.0'; // bind to all interfaces so Docker/ngrok can reach it

async function main() {
  const server = await buildServer();

  try {
    await server.listen({ port: PORT, host: HOST });
    console.log(`\n🚀 CallOps API running at http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health\n`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
