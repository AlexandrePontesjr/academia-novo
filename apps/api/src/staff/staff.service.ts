import type { CreateStaffRequest, Staff } from '@academia/contracts';
import { type Database, schema } from '@academia/database';
import { audit, type AuditActor, diffOf } from '../audit/audit.ts';
import { isUniqueViolation } from '../db-errors.ts';

const { staff } = schema;

/** Os campos de `staff` cuja trilha de auditoria guarda o valor (AD-026, AD-056); dos demais, só o nome. */
const REGISTRABLE = ['status'];

/** Na ordem em que a trilha lista os campos alterados. */
const TRACKED = ['name', 'cpf', 'position', 'department', 'hiredAt', 'phone', 'email', 'status'] as const;

type Fields = {
  name: string;
  cpf: string;
  position: string;
  department: string | null;
  hiredAt: string;
  phone: string;
  email: string | null;
  status: string;
};

/** Antes da criação nada existe: todo campo preenchido conta como alterado. */
const NOTHING = Object.fromEntries(TRACKED.map((field) => [field, null])) as unknown as Fields;

type Row = typeof staff.$inferSelect;

/** O funcionário sem a foto, que quem monta a resposta acrescenta. */
export type StaffRecord = Omit<Staff, 'photoUrl'>;

/** Leitura e escrita de `staff`, e a linha de auditoria de cada uma, na mesma transação. */
export class StaffService {
  constructor(private readonly db: Database['db']) {}

  /** Cria o funcionário; `null` quando o CPF já pertence a um funcionário de qualquer situação. */
  async create(input: CreateStaffRequest, actor: AuditActor): Promise<StaffRecord | null> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(staff)
          .values({
            name: input.name,
            cpf: input.cpf,
            position: input.position,
            department: input.department ?? null,
            hiredAt: input.hiredAt,
            phone: input.phone,
            email: input.email ?? null,
          })
          // o índice único decide a corrida entre dois cadastros do mesmo CPF: o segundo espera o primeiro
          .onConflictDoNothing({ target: staff.cpf })
          .returning();
        if (!row) return null;

        await audit.record(tx, {
          actor,
          action: 'staff.created',
          entity: 'staff',
          entityId: row.id,
          diff: diffOf(NOTHING, fieldsOf(row), TRACKED, REGISTRABLE),
        });
        return toRecord(row, null);
      });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }
}

const fieldsOf = (row: Row): Fields => ({
  name: row.name,
  cpf: row.cpf,
  position: row.position,
  department: row.department,
  hiredAt: row.hiredAt,
  phone: row.phone,
  email: row.email,
  status: row.status,
});

/** A ficha sem a foto; `user` é o usuário vinculado, lido na hora (door 1). */
const toRecord = (row: Row, user: StaffRecord['user']): StaffRecord => ({
  id: row.id,
  name: row.name,
  status: row.status,
  cpf: row.cpf,
  position: row.position,
  department: row.department,
  hiredAt: row.hiredAt,
  phone: row.phone,
  email: row.email,
  user,
});
