import { createServer, type Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { MinioContainer } from '@testcontainers/minio';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as runMigrations } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import type { StorageEnv } from './app.ts';

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

/**
 * O MinIO do Docker Hub (`minio/minio`) deixou de ser publicado; a imagem da Chainguard é o mesmo
 * MinIO. O compose (S7) usa a mesma imagem.
 */
export const MINIO_IMAGE = 'cgr.dev/chainguard/minio:latest';
export const STORAGE_BUCKET = 'photos-test';
export const STORAGE_ACCESS_KEY = 'ak-minio-teste-7f3a';
export const STORAGE_SECRET_KEY = 'sk-minio-teste-9c1e5d02';

/** Um cliente S3 do teste, para criar o bucket e ler o que a API gravou (nunca pelas rotas). */
export function s3Client(endpoint: string, accessKeyId = STORAGE_ACCESS_KEY, secretAccessKey = STORAGE_SECRET_KEY) {
  return new S3Client({ endpoint, region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
}

/** MinIO real, um por arquivo de teste (AD-012), com o bucket criado e privado. */
export async function startMinio() {
  const container = await new MinioContainer(MINIO_IMAGE)
    .withUsername(STORAGE_ACCESS_KEY)
    .withPassword(STORAGE_SECRET_KEY)
    .start();
  const endpoint = container.getConnectionUrl();
  const client = s3Client(endpoint);
  await client.send(new CreateBucketCommand({ Bucket: STORAGE_BUCKET }));
  const env: StorageEnv = {
    S3_ENDPOINT: endpoint,
    S3_BUCKET: STORAGE_BUCKET,
    S3_ACCESS_KEY_ID: STORAGE_ACCESS_KEY,
    S3_SECRET_ACCESS_KEY: STORAGE_SECRET_KEY,
  };
  return { endpoint, bucket: STORAGE_BUCKET, env, client, stop: () => container.stop() };
}

export type Minio = Awaited<ReturnType<typeof startMinio>>;
