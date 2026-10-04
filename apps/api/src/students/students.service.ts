import {
  type CreateStudentRequest,
  decodeStudentsCursor,
  encodeStudentsCursor,
  type Student,
  type StudentsQuery,
  type UpdateStudentRequest,
} from '@academia/contracts';
import { and, type Database, eq, schema, sql } from '@academia/database';
import { audit, type AuditActor, diffOf } from '../audit/audit.ts';
import type { ColumnCipher } from '../crypto.ts';
import { seesContact } from './students.view.ts';

const { students } = schema;

/** Fixo: a tela é a única consumidora. */
const PAGE_SIZE = 50;

/** Os campos de `student` cuja trilha de auditoria guarda o valor (AD-026, AD-032); dos demais, só o nome. */
const REGISTRABLE = ['status'];

/** Na ordem em que a trilha lista os campos alterados. */
const TRACKED = [
  'name',
  'cpf',
  'birthDate',
  'sex',
  'email',
  'phone',
  'address',
  'emergencyContactName',
  'emergencyContactPhone',
  'healthNotes',
  'status',
] as const;

type Fields = {
  name: string;
  cpf: string;
  birthDate: string;
  sex: string | null;
  email: string | null;
  phone: string;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  healthNotes: string | null;
  status: string;
};

/** Antes da criação nada existe: todo campo preenchido conta como alterado. */
const NOTHING = Object.fromEntries(TRACKED.map((field) => [field, null])) as unknown as Fields;

type Row = typeof students.$inferSelect;

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = '23505';

/** O Drizzle embrulha o erro do `pg` em `cause`. */
const isUniqueViolation = (error: unknown) =>
  [error, (error as { cause?: unknown } | null)?.cause].some(
    (candidate) => (candidate as { code?: unknown } | null)?.code === UNIQUE_VIOLATION,
  );

export type StudentChange =
  | { outcome: 'ok'; student: Student }
  | { outcome: 'not_found' }
  | { outcome: 'cpf_taken' }
  /** O par do contato de emergência ficaria com um dos dois vazios. */
  | { outcome: 'incomplete_contact'; missing: 'emergencyContactName' | 'emergencyContactPhone' };

/** Leitura e escrita de `students`, e a linha de auditoria de cada escrita, na mesma transação. */
export class StudentsService {
  constructor(
    private readonly db: Database['db'],
    private readonly cipher: ColumnCipher,
  ) {}

  /** Cria o aluno; `null` quando o CPF já pertence a um aluno de qualquer situação. */
  async create(input: CreateStudentRequest, actor: AuditActor): Promise<Student | null> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(students)
          .values({
            name: input.name,
            cpf: input.cpf,
            birthDate: input.birthDate,
            sex: input.sex ?? null,
            email: input.email ?? null,
            phone: input.phone,
            address: input.address ?? null,
            emergencyContactName: input.emergencyContactName ?? null,
            emergencyContactPhone: input.emergencyContactPhone ?? null,
          })
          // o índice único decide a corrida entre dois cadastros do mesmo CPF: o segundo espera o primeiro
          .onConflictDoNothing({ target: students.cpf })
          .returning();
        if (!row) return null;
        // o valor cifrado leva o `id` da linha, que só o banco gera: entra logo depois, na mesma transação
        if (input.healthNotes !== undefined) {
          await tx
            .update(students)
            .set({ healthNotesEnc: this.cipher.encrypt(input.healthNotes, row.id) })
            .where(eq(students.id, row.id));
        }

        const student = this.toStudent(row, input.healthNotes ?? null);
        await audit.record(tx, {
          actor,
          action: 'student.created',
          entity: 'student',
          entityId: row.id,
          diff: diffOf(NOTHING, fieldsOf(student), TRACKED, REGISTRABLE),
        });
        return student;
      });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  /** O aluno, com as observações de saúde decifradas só quando `withHealthNotes`; `undefined` se não existe. */
  async find(id: string, withHealthNotes: boolean): Promise<Student | undefined> {
    if (!UUID.test(id)) return undefined;
    const [row] = await this.db.select().from(students).where(eq(students.id, id));
    if (!row) return undefined;
    return this.toStudent(row, withHealthNotes ? this.healthNotesOf(row) : null);
  }

  /**
   * Altera só os campos enviados, com a linha travada: duas edições de campos diferentes se somam.
   * Sem mudança de valor não grava nada, nem em `students` nem na trilha.
   */
  async update(id: string, change: UpdateStudentRequest, actor: AuditActor): Promise<StudentChange> {
    if (!UUID.test(id)) return { outcome: 'not_found' };
    try {
      return await this.db.transaction(async (tx): Promise<StudentChange> => {
        const [row] = await tx.select().from(students).where(eq(students.id, id)).for('update');
        if (!row) return { outcome: 'not_found' };

        const current = this.toStudent(row, this.safeHealthNotes(row, change.healthNotes !== undefined));
        const before = fieldsOf(current);
        const after: Fields = { ...before };
        for (const field of TRACKED) {
          const sent = change[field];
          if (sent !== undefined) (after as Record<string, unknown>)[field] = sent;
        }

        const missing = missingContact(after);
        if (missing) return { outcome: 'incomplete_contact', missing };

        const diff = diffOf(before, after, TRACKED, REGISTRABLE);
        if (!diff) return { outcome: 'ok', student: current };

        const [updated] = await tx
          .update(students)
          .set({
            name: after.name,
            cpf: after.cpf,
            birthDate: after.birthDate,
            sex: after.sex,
            email: after.email,
            phone: after.phone,
            address: after.address,
            emergencyContactName: after.emergencyContactName,
            emergencyContactPhone: after.emergencyContactPhone,
            ...(change.healthNotes !== undefined && {
              healthNotesEnc: change.healthNotes === null ? null : this.cipher.encrypt(change.healthNotes, id),
            }),
            status: after.status as Row['status'],
            updatedAt: new Date(),
          })
          .where(eq(students.id, id))
          .returning();
        await audit.record(tx, { actor, action: 'student.updated', entity: 'student', entityId: id, diff });
        return { outcome: 'ok', student: this.toStudent(updated!, after.healthNotes) };
      });
    } catch (error) {
      if (isUniqueViolation(error)) return { outcome: 'cpf_taken' };
      throw error;
    }
  }

  /** Inativa o aluno (RF-08): a linha fica. `false` quando ele não existe; já inativo, nada muda. */
  async inactivate(id: string, actor: AuditActor): Promise<boolean> {
    if (!UUID.test(id)) return false;
    return this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(students).where(eq(students.id, id)).for('update');
      if (!row) return false;
      if (row.status === 'inactive') return true;

      await tx.update(students).set({ status: 'inactive', updatedAt: new Date() }).where(eq(students.id, id));
      await audit.record(tx, {
        actor,
        action: 'student.inactivated',
        entity: 'student',
        entityId: id,
        diff: diffOf({ status: row.status }, { status: 'inactive' }, ['status'], REGISTRABLE),
      });
      return true;
    });
  }

  /**
   * Uma página de alunos, por nome sem caixa nem acento e, no empate, por `id`. O cursor guarda esse
   * nome e o id do último da página: a página seguinte começa logo depois dele, sem repetir nem pular
   * quem tem o mesmo nome. Quem não vê CPF e telefone não os compara: busca só de dígitos dá lista vazia.
   */
  async list(query: StudentsQuery, role: Parameters<typeof seesContact>[0]) {
    const cursor = query.cursor ? decodeStudentsCursor(query.cursor) : null;
    const where = this.searchCondition(query.q, seesContact(role));
    if (where === 'nothing') return { rows: [], nextCursor: null };

    const folded = sql<string>`students_fold(${students.name})`;
    const rows = await this.db
      .select({
        id: students.id,
        name: students.name,
        status: students.status,
        cpf: students.cpf,
        phone: students.phone,
        sort: folded,
      })
      .from(students)
      .where(
        and(
          query.status ? eq(students.status, query.status) : undefined,
          where,
          cursor
            ? sql`(${folded} collate "C", ${students.id}) > (${cursor.name}::text collate "C", ${cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(sql`${folded} collate "C"`, students.id)
      .limit(PAGE_SIZE + 1);

    const page = rows.slice(0, PAGE_SIZE);
    const last = page[page.length - 1];
    return {
      rows: page.map(({ id, name, status, cpf, phone }) => ({ id, name, status, cpf, phone })),
      nextCursor: rows.length > PAGE_SIZE && last ? encodeStudentsCursor({ name: last.sort, id: last.id }) : null,
    };
  }

  /** `q` só de dígitos compara CPF e telefone; com letra, cada termo tem de estar no nome. */
  private searchCondition(q: string | undefined, canSeeContact: boolean) {
    if (q === undefined) return undefined;
    const digits = q.replace(/[\s.\-()]/g, '');
    if (/^\d+$/.test(digits)) {
      if (!canSeeContact) return 'nothing' as const;
      return sql`(${students.cpf} = ${digits} or ${students.phone} like ${`%${digits}%`})`;
    }
    const terms = q.split(/\s+/).filter(Boolean);
    return and(
      ...terms.map(
        (term) =>
          sql`students_fold(${students.name}) like '%' || students_fold(${term.replace(/[\\%_]/g, '\\$&')}) || '%'`,
      ),
    );
  }

  private toStudent(row: Row, healthNotes: string | null): Student {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      cpf: row.cpf,
      birthDate: row.birthDate,
      sex: row.sex as Student['sex'],
      email: row.email,
      phone: row.phone,
      address: row.address,
      emergencyContactName: row.emergencyContactName,
      emergencyContactPhone: row.emergencyContactPhone,
      healthNotes,
    };
  }

  /** Decifra as observações; um valor que não decifra lança, e a rota responde `500`. */
  private healthNotesOf(row: Row): string | null {
    return row.healthNotesEnc === null ? null : this.cipher.decrypt(row.healthNotesEnc, row.id);
  }

  /**
   * As observações atuais para comparar com as enviadas. Quando o `PATCH` as substitui, um valor
   * ilegível não impede a correção: conta como mudança.
   */
  private safeHealthNotes(row: Row, replacing: boolean): string | null {
    try {
      return this.healthNotesOf(row);
    } catch (error) {
      if (replacing) return null;
      throw error;
    }
  }
}

const fieldsOf = (student: Student): Fields => ({
  name: student.name,
  cpf: student.cpf!,
  birthDate: student.birthDate!,
  sex: student.sex ?? null,
  email: student.email ?? null,
  phone: student.phone!,
  address: student.address ?? null,
  emergencyContactName: student.emergencyContactName ?? null,
  emergencyContactPhone: student.emergencyContactPhone ?? null,
  healthNotes: student.healthNotes ?? null,
  status: student.status,
});

const missingContact = (fields: Fields) => {
  if (fields.emergencyContactName !== null && fields.emergencyContactPhone === null) return 'emergencyContactPhone' as const;
  if (fields.emergencyContactPhone !== null && fields.emergencyContactName === null) return 'emergencyContactName' as const;
  return undefined;
};
