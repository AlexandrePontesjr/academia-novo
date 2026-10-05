import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { Env } from '../env.ts';

/** Nenhum pedido ao armazenamento espera mais que isto: a API responde `503` em vez de pendurar o envio. */
const CONNECTION_TIMEOUT_MS = 3000;
const REQUEST_TIMEOUT_MS = 15_000;

/** O armazenamento de objetos não respondeu como devia. */
export class StorageUnavailable extends Error {
  constructor(cause: unknown) {
    super('storage unavailable', { cause });
  }
}

/**
 * O bucket privado (door 3): só a API lê e grava. Quem chama só ouve `StorageUnavailable`; o texto
 * do erro do SDK, que carrega o endereço e a chave, nunca sai daqui para a resposta nem para o log.
 */
@Injectable()
export class PhotoStorage implements OnApplicationShutdown {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(env: Pick<Env, 'S3_ENDPOINT' | 'S3_BUCKET' | 'S3_ACCESS_KEY_ID' | 'S3_SECRET_ACCESS_KEY'>) {
    this.bucket = env.S3_BUCKET;
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: 'us-east-1',
      forcePathStyle: true,
      maxAttempts: 2,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
      requestHandler: { connectionTimeout: CONNECTION_TIMEOUT_MS, requestTimeout: REQUEST_TIMEOUT_MS },
    });
  }

  /** O bucket responde? `false` sem endpoint, sem bucket ou sem resposta dentro de `timeoutMs`. */
  async check(timeoutMs: number): Promise<boolean> {
    return this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), { abortSignal: AbortSignal.timeout(timeoutMs) }).then(
      () => true,
      () => false,
    );
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: 'image/webp' }),
      );
    } catch (error) {
      throw new StorageUnavailable(error);
    }
  }

  /** Os bytes do objeto, ou `undefined` quando a chave não existe. */
  async get(key: string): Promise<Buffer | undefined> {
    try {
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return Buffer.from(await object.Body!.transformToByteArray());
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') return undefined;
      throw new StorageUnavailable(error);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      throw new StorageUnavailable(error);
    }
  }

  onApplicationShutdown() {
    this.client.destroy();
  }
}
