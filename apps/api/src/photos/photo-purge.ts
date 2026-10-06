import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { PhotosService } from './photos.service.ts';

const INTERVAL_MS = 60 * 60 * 1000;

const log = (level: 'info' | 'error', fields: Record<string, unknown>) =>
  (level === 'error' ? process.stderr : process.stdout).write(
    JSON.stringify({ level, time: new Date().toISOString(), ...fields }) + '\n',
  );

/**
 * O expurgo das versões de foto vencidas (foto-captura, door 4): um temporizador dentro do processo
 * da API, que executa na subida e a cada 60 minutos. Uma execução que falha não derruba a API nem
 * impede a seguinte, e o log nunca leva chave de objeto nem texto de erro.
 */
@Injectable()
export class PhotoPurge implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: ReturnType<typeof setInterval>;

  constructor(@Inject(PhotosService) private readonly photos: PhotosService) {}

  onApplicationBootstrap() {
    void this.run();
    this.timer = setInterval(() => void this.run(), INTERVAL_MS);
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  /** Uma execução. Nunca lança: o que falha vira uma linha de log, e a versão fica para a próxima. */
  async run(): Promise<void> {
    let outcome = { purged: 0, failed: 0 };
    try {
      outcome = await this.photos.purgeExpired();
    } catch {
      outcome.failed = 1;
    }
    if (outcome.purged > 0) log('info', { msg: 'photo versions purged', count: outcome.purged });
    if (outcome.failed > 0) log('error', { msg: 'photo purge failed' });
  }
}
