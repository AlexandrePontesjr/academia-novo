import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL não definida');
  process.exit(1);
}

// MIGRATIONS_FOLDER existe para os testes apontarem para uma pasta com uma migração quebrada.
const migrationsFolder =
  process.env.MIGRATIONS_FOLDER ?? fileURLToPath(new URL('../migrations', import.meta.url));

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder });
  console.log('Migrações aplicadas.');
} catch (error) {
  console.error('Falha ao aplicar as migrações:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
