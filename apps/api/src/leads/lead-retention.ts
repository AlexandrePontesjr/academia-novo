import { type Database, sql } from '@academia/database';
import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { audit, NO_ACTOR } from '../audit/audit.ts';
import { DATABASE } from '../tokens.ts';

const INTERVAL_MS = 60 * 60 * 1000;
/** Quem não confirmou o e-mail some em 7 dias; qualquer interessado, em 90 (door 10). Mudar é um commit. */
const UNCONFIRMED_DAYS = 7;
const ANY_DAYS = 90;

const log = (level: 'info' | 'error', fields: Record<string, unknown>) =>
  (level === 'error' ? process.stderr : process.stdout).write(
    JSON.stringify({ level, time: new Date().toISOString(), ...fields }) + '\n',
  );

/**
 * A retenção de interessados (pre-cadastro, door 10): um temporizador dentro do processo da API, no
 * molde do expurgo de fotos, que executa na subida e a cada 60 minutos. Apaga numa transação os
 * vencidos, com os tokens em cascata, e grava uma linha `lead.purged` por apagado. Os prazos são os
 * do relógio do banco, e ficam fora de `privacy_settings`.
 */
@Injectable()
export class LeadRetention implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: ReturnType<typeof setInterval>;

  constructor(@Inject(DATABASE) private readonly database: Database) {}

  onApplicationBootstrap() {
    void this.run();
    this.timer = setInterval(() => void this.run(), INTERVAL_MS);
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  /** Uma execução. Nunca lança: a falha vira uma linha de log sem identificador, e a próxima tenta de novo. */
  async run(): Promise<void> {
    try {
      const purged = await this.database.db.transaction(async (tx) => {
        const { rows } = await tx.execute<{ id: string }>(sql`
          delete from leads
          where (email_verified_at is null and created_at < now() - make_interval(days => ${UNCONFIRMED_DAYS}))
             or created_at < now() - make_interval(days => ${ANY_DAYS})
          returning id`);
        for (const { id } of rows) {
          await audit.record(tx, { actor: NO_ACTOR, action: 'lead.purged', entity: 'lead', entityId: id });
        }
        return rows.length;
      });
      if (purged > 0) log('info', { msg: 'leads purged', count: purged });
    } catch {
      log('error', { msg: 'lead retention failed' });
    }
  }
}
