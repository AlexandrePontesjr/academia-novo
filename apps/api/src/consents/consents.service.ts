import {
  type Consent,
  type ConsentTerm,
  type GrantConsentRequest,
  isMinor,
  saoPauloToday,
  type StudentConsentsResponse,
} from '@academia/contracts';
import { and, type Database, desc, eq, isNull, schema, sql } from '@academia/database';
import { audit, type AuditActor, diffOf } from '../audit/audit.ts';
import { isUniqueViolation } from '../db-errors.ts';

const { consentTerms, consents, guardians, students } = schema;

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Os campos de um consentimento cuja trilha guarda o valor (AD-026): nenhum é dado pessoal. */
const TRACKED = ['purpose', 'termVersion', 'grantedBy'] as const;
type Tracked = Record<(typeof TRACKED)[number], string | number | null>;
const NOTHING: Tracked = { purpose: null, termVersion: null, grantedBy: null };

export type GrantOutcome =
  | { outcome: 'ok'; consent: Consent }
  | { outcome: 'not_found' }
  /** Um `422` por campo: o caminho que a tela marca e a mensagem. */
  | { outcome: 'invalid'; path: 'grantedBy' | 'termVersion'; message: string }
  | { outcome: 'term_outdated' }
  | { outcome: 'consent_active' };

const trackedOf = (row: typeof consents.$inferSelect): Tracked => ({
  purpose: row.purpose,
  termVersion: row.termVersion,
  grantedBy: row.grantedBy,
});

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

  /**
   * Registra o aceite com a linha do aluno travada: duas concessões da mesma finalidade esperam uma
   * pela outra, e o índice parcial continua sendo quem recusa a segunda se a conferência falhar.
   */
  async grant(studentId: string, input: GrantConsentRequest, actor: AuditActor): Promise<GrantOutcome> {
    if (!UUID.test(studentId)) return { outcome: 'not_found' };
    try {
      return await this.db.transaction(async (tx): Promise<GrantOutcome> => {
        const [student] = await tx
          .select({ birthDate: students.birthDate })
          .from(students)
          .where(eq(students.id, studentId))
          .for('update');
        if (!student) return { outcome: 'not_found' };

        const [guardian] = await tx
          .select({ id: guardians.id, name: guardians.name })
          .from(guardians)
          .where(eq(guardians.studentId, studentId))
          .orderBy(desc(guardians.id))
          .limit(1);
        if (input.grantedBy === 'student' && isMinor(student.birthDate, saoPauloToday())) {
          return {
            outcome: 'invalid',
            path: 'grantedBy',
            message: 'O aluno menor de 18 anos não concede o próprio consentimento.',
          };
        }
        if (input.grantedBy === 'guardian' && !guardian) {
          return { outcome: 'invalid', path: 'grantedBy', message: 'O aluno não tem responsável legal cadastrado.' };
        }

        const [latest] = await tx
          .select({ version: sql<number | null>`max(${consentTerms.version})` })
          .from(consentTerms)
          .where(eq(consentTerms.purpose, input.purpose));
        if (latest?.version == null || input.termVersion > latest.version) {
          return { outcome: 'invalid', path: 'termVersion', message: 'Essa versão do termo não existe.' };
        }
        if (input.termVersion < latest.version) return { outcome: 'term_outdated' };

        const [active] = await tx
          .select({ id: consents.id })
          .from(consents)
          .where(and(eq(consents.studentId, studentId), eq(consents.purpose, input.purpose), isNull(consents.revokedAt)));
        if (active) return { outcome: 'consent_active' };

        const [row] = await tx
          .insert(consents)
          .values({
            studentId,
            purpose: input.purpose,
            termVersion: input.termVersion,
            grantedBy: input.grantedBy,
            guardianId: input.grantedBy === 'guardian' ? guardian!.id : null,
          })
          .returning();
        const granted = row!;
        await audit.record(tx, {
          actor,
          action: 'student.consent_granted',
          entity: 'student',
          entityId: studentId,
          diff: diffOf<Tracked>(NOTHING, trackedOf(granted), TRACKED, TRACKED),
        });
        return {
          outcome: 'ok',
          consent: {
            id: granted.id,
            purpose: granted.purpose,
            termVersion: granted.termVersion,
            grantedBy: granted.grantedBy,
            guardian: input.grantedBy === 'guardian' ? { id: guardian!.id, name: guardian!.name } : null,
            grantedAt: granted.grantedAt.toISOString(),
            revokedAt: null,
          },
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) return { outcome: 'consent_active' };
      throw error;
    }
  }

  /**
   * A ficha do aluno numa chamada: o responsável atual (a linha de maior `id`) e todos os
   * consentimentos, revogados inclusive, do mais recente ao mais antigo. Cada item traz o responsável
   * de quando foi concedido, não o atual. `undefined` quando o aluno não existe.
   */
  async ficha(studentId: string): Promise<StudentConsentsResponse | undefined> {
    if (!UUID.test(studentId)) return undefined;
    const [student] = await this.db.select({ id: students.id }).from(students).where(eq(students.id, studentId));
    if (!student) return undefined;

    const [current] = await this.db
      .select()
      .from(guardians)
      .where(eq(guardians.studentId, studentId))
      .orderBy(desc(guardians.id))
      .limit(1);
    const rows = await this.db
      .select({ consent: consents, guardianName: guardians.name })
      .from(consents)
      .leftJoin(guardians, eq(guardians.id, consents.guardianId))
      .where(eq(consents.studentId, studentId))
      .orderBy(desc(consents.grantedAt), desc(consents.id));
    return {
      guardian: current
        ? {
            id: current.id,
            name: current.name,
            cpf: current.cpf,
            phone: current.phone,
            relationship: current.relationship,
            createdAt: current.createdAt.toISOString(),
          }
        : null,
      items: rows.map(({ consent, guardianName }) => ({
        id: consent.id,
        purpose: consent.purpose,
        termVersion: consent.termVersion,
        grantedBy: consent.grantedBy,
        guardian: consent.guardianId ? { id: consent.guardianId, name: guardianName! } : null,
        grantedAt: consent.grantedAt.toISOString(),
        revokedAt: consent.revokedAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * Revoga: preenche `revoked_at` com o instante do banco e mantém a linha. `false` quando o
   * consentimento não existe ou é de outro aluno; já revogado, nada muda e nada é gravado.
   */
  async revoke(studentId: string, consentId: string, actor: AuditActor): Promise<boolean> {
    if (!UUID.test(studentId) || !UUID.test(consentId)) return false;
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(consents)
        .where(and(eq(consents.id, consentId), eq(consents.studentId, studentId)));
      if (!row) return false;
      if (row.revokedAt !== null) return true;

      // o `WHERE` repete a condição: duas revogações ao mesmo tempo gravam uma vez só
      const revoked = await tx
        .update(consents)
        .set({ revokedAt: sql`now()` })
        .where(and(eq(consents.id, consentId), isNull(consents.revokedAt)))
        .returning({ id: consents.id });
      if (revoked.length === 0) return true;
      await audit.record(tx, {
        actor,
        action: 'student.consent_revoked',
        entity: 'student',
        entityId: studentId,
        diff: diffOf<Tracked>(trackedOf(row), NOTHING, TRACKED, TRACKED),
      });
      return true;
    });
  }
}
