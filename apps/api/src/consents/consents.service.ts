import type { ConsentTerm } from '@academia/contracts';
import { type Database, desc, schema } from '@academia/database';

const { consentTerms } = schema;

/** Termos, consentimentos e a ficha de um aluno; cada escrita grava a trilha na mesma transação. */
export class ConsentsService {
  constructor(private readonly db: Database['db']) {}

  /** A versão mais recente de cada finalidade: a maior `version` numérica, não a de texto (door 2). */
  async currentTerms(): Promise<ConsentTerm[]> {
    const rows = await this.db
      .selectDistinctOn([consentTerms.purpose])
      .from(consentTerms)
      .orderBy(consentTerms.purpose, desc(consentTerms.version));
    return rows.map((row) => ({
      purpose: row.purpose,
      version: row.version,
      text: row.text,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
