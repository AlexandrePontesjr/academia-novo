import type { CreateStaffRequest, Staff, StaffListItem } from '@academia/contracts';
import { type Database, eq, schema, sql } from '@academia/database';
import { audit, type AuditActor, diffOf } from '../audit/audit.ts';
import { isUniqueViolation } from '../db-errors.ts';

const { staff, users } = schema;

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

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

/** Um item da lista sem a miniatura. */
export type StaffListRecord = Omit<StaffListItem, 'photoUrl'>;

type Tx = Parameters<Parameters<Database['db']['transaction']>[0]>[0];

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

  /**
   * A ficha, lida e auditada na mesma transação (door 5): `staff.viewed` entra antes de o dado sair, e
   * se a linha não entra a leitura falha. `undefined` se o funcionário não existe, sem gravar nada.
   */
  async find(id: string, actor: AuditActor): Promise<StaffRecord | undefined> {
    if (!UUID.test(id)) return undefined;
    return this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(staff).where(eq(staff.id, id));
      if (!row) return undefined;
      const user = await userOf(tx, row.userId);
      await audit.record(tx, { actor, action: 'staff.viewed', entity: 'staff', entityId: row.id });
      return toRecord(row, user);
    });
  }

  /**
   * Todos os funcionários, ativos e inativos, por nome sem caixa nem acento e, no empate, por `id`
   * (AD-035). Uma linha `staff.list_viewed` por leitura, sem alvo e mesmo com a lista vazia (door 5).
   */
  async list(actor: AuditActor): Promise<StaffListRecord[]> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: staff.id,
          name: staff.name,
          position: staff.position,
          department: staff.department,
          status: staff.status,
        })
        .from(staff)
        .orderBy(sql`students_fold(${staff.name}) collate "C"`, staff.id);
      await audit.record(tx, { actor, action: 'staff.list_viewed', entity: 'staff', entityId: null });
      return rows;
    });
  }
}

/** O usuário vinculado, com o perfil e a situação de agora; `null` sem vínculo. */
async function userOf(tx: Tx, userId: string | null): Promise<StaffRecord['user']> {
  if (userId === null) return null;
  const [user] = await tx
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, userId));
  return user ?? null;
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
