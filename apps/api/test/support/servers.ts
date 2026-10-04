import { createServer, type Socket } from 'node:net';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

/** Postgres real, um por arquivo de teste que precisa dele. */
export async function startPostgres() {
  const container = await new PostgreSqlContainer('postgres:18-alpine').start();
  return { url: container.getConnectionUri(), stop: () => container.stop() };
}

/** URL de um Postgres numa porta onde ninguém escuta: a conexão é recusada. */
export async function refusingDatabaseUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  await new Promise((resolve) => server.close(resolve));
  return `postgres://academia:academia@127.0.0.1:${port}/academia`;
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
