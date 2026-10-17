import { and, asc, type Database, eq, isNull, schema, sql } from '@academia/database';
import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { NO_ACTOR } from '../audit/audit.ts';
import { DATABASE } from '../tokens.ts';
import { PrivacyService } from './privacy.service.ts';

const { students } = schema;

const INTERVAL_MS = 60 * 60 * 1000;

const log = (level: 'info' | 'error', fields: Record<string, unknown>) =>
  (level === 'error' ? process.stderr : process.stdout).write(
    JSON.stringify({ level, time: new Date().toISOString(), ...fields }) + '\n',
  );

/**
 * A anonimização automática de inativos (privacidade, door 7): um temporizador dentro do processo da
 * API, no molde do expurgo de fotos, que executa na subida e a cada 60 minutos. Com o prazo desligado
 * não faz nada. Cada vencido passa pelo mesmo caminho do pedido, com `NO_ACTOR`, um por transação; quem
 * tem período em aberto fica para a próxima, e uma falha num titular não impede os seguintes.
 */
@Injectable()
export class PrivacyRetention implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(PrivacyService) private readonly privacy: PrivacyService,
  ) {}

  onApplicationBootstrap() {
    void this.run();
    this.timer = setInterval(() => void this.run(), INTERVAL_MS);
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  /** Uma execução. Nunca lança: o que falha vira uma linha de log sem texto de erro nem identificador. */
  async run(): Promise<void> {
    const outcome = { anonymized: 0, skipped: 0, failed: 0 };
    try {
      const { inactiveStudentRetentionYears: years } = await this.privacy.settings();
      if (years !== null) {
        for (const id of await this.due(years, new Date())) {
          try {
            const result = await this.privacy.anonymizeStudent(id, NO_ACTOR);
            if (result === 'anonymized') outcome.anonymized += 1;
            if (result === 'open_periods') outcome.skipped += 1;
            // `not_found` e `not_inactive`: outra execução ou uma edição chegou antes, e ele não conta
          } catch {
            outcome.failed += 1;
          }
        }
      }
    } catch {
      outcome.failed += 1;
    }
    if (outcome.anonymized > 0 || outcome.skipped > 0) {
      log('info', { msg: 'retention applied', anonymized: outcome.anonymized, skipped: outcome.skipped });
    }
    if (outcome.failed > 0) log('error', { msg: 'retention failed', failed: outcome.failed });
  }

  /**
   * Os alunos `inactive`, não anonimizados, cujo instante de inativação mais N anos já chegou em `now`.
   * `now` é o relógio da API; a soma de anos é a do Postgres sobre o instante (29/02 mais 1 ano é 28/02),
   * e por isso soma a `inactivated_at` em vez de subtrair de `now`.
   */
  private async due(years: number, now: Date): Promise<string[]> {
    const rows = await this.database.db
      .select({ id: students.id })
      .from(students)
      .where(
        and(
          eq(students.status, 'inactive'),
          isNull(students.anonymizedAt),
          sql`${students.inactivatedAt} + make_interval(years => ${years}::int) <= ${now.toISOString()}::timestamptz`,
        ),
      )
      .orderBy(asc(students.id));
    return rows.map((row) => row.id);
  }
}
