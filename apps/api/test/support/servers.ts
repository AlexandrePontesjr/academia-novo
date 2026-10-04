import { createServer, type Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as runMigrations } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

/** Postgres real e já migrado, um por arquivo de teste que precisa dele. */
export async function startPostgres() {
  const container = await new PostgreSqlContainer('postgres:18-alpine').start();
  await migrate(container.getConnectionUri());
  return { url: container.getConnectionUri(), stop: () => container.stop() };
}

/** Aplica as migrações de `packages/database`, como o `pnpm db:migrate` faz antes de a API subir. */
export async function migrate(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await runMigrations(drizzle(pool), {
      migrationsFolder: fileURLToPath(
        new URL('../../../../packages/database/migrations', import.meta.url),
      ),
    });
  } finally {
    await pool.end();
  }
}

/** Uma porta TCP local em que ninguém escuta. */
export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/** URL de um Postgres numa porta onde ninguém escuta: a conexão é recusada. */
export async function refusingDatabaseUrl(): Promise<string> {
  return `postgres://academia:academia@127.0.0.1:${await freePort()}/academia`;
}

/** Servidor que aceita a conexão TCP e nunca responde nada. */
export async function startHangingDatabase() {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return {
    url: `postgres://academia:academia@127.0.0.1:${port}/academia`,
    stop: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
