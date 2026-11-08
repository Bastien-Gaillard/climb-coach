/**
 * Crée un compte. En prod :
 *   docker compose -f docker-compose.prod.yml --env-file .env.prod exec api node dist/db/create-user.js <nom>
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { normalizeUsername } from '../auth/users.service';

async function main() {
  const username = normalizeUsername(process.argv[2] ?? '');
  if (!/^[a-z0-9._-]{1,40}$/.test(username)) {
    console.error('Usage : node dist/db/create-user.js <nom>  (lettres, chiffres, . _ -)');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const db = drizzle(pool, { schema });
    const [user] = await db
      .insert(schema.users)
      .values({ username })
      .onConflictDoNothing()
      .returning();
    console.log(user ? `Compte « ${username} » créé` : `Le compte « ${username} » existe déjà`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
