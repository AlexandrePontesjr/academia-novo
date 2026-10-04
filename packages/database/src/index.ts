import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

export { sql } from 'drizzle-orm';
export * as schema from './schema.ts';

export interface DatabaseOptions {
  /** Limite, em ms, para abrir uma conexão e para cada consulta. */
  timeoutMs?: number;
}

/** Abre o pool (as conexões só são criadas na primeira consulta) e o cliente Drizzle sobre ele. */
export function createDatabase(url: string, { timeoutMs }: DatabaseOptions = {}) {
  const pool = new pg.Pool({
    connectionString: url,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
  });
  // sem ouvinte, um erro numa conexão ociosa derruba o processo
  pool.on('error', () => {});
  return { db: drizzle(pool), close: () => pool.end() };
}

export type Database = ReturnType<typeof createDatabase>;
