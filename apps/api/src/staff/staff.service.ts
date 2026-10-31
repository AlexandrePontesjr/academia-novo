import type { CreateStaffRequest, Staff, StaffListItem, UpdateStaffRequest } from '@academia/contracts';
import { and, type Database, eq, isNull, schema, sql } from '@academia/database';
import { audit, type AuditActor, diffOf } from '../audit/audit.ts';
import { isUniqueViolation } from '../db-errors.ts';
import { lockActiveAdmins } from '../users/active-admins.ts';

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

/** O funcionário pelo id, se não foi anonimizado: o anonimizado não existe para estas rotas (privacidade, door 2). */
const identified = (id: string) => and(eq(staff.id, id), isNull(staff.anonymizedAt));

export type StaffChange = { outcome: 'ok'; staff: StaffRecord } | { outcome: 'not_found' } | { outcome: 'cpf_taken' };

/** O desfecho de vincular um usuário: `user_unknown` é o `userId` que não é de usuário nenhum. */
export type LinkOutcome = 'ok' | 'not_found' | 'user_unknown' | 'user_already_linked';

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
   * Altera só os campos enviados, com a linha travada: duas edições de campos diferentes se somam. Sem
   * mudança de valor não grava nada, nem em `staff` nem na trilha.
   */
  async update(id: string, change: UpdateStaffRequest, actor: AuditActor): Promise<StaffChange> {
    if (!UUID.test(id)) return { outcome: 'not_found' };
    try {
      return await this.db.transaction(async (tx): Promise<StaffChange> => {
        const [row] = await tx.select().from(staff).where(identified(id)).for('update');
        if (!row) return { outcome: 'not_found' };

        const before = fieldsOf(row);
        const after: Fields = { ...before };
        for (const field of TRACKED) {
          const sent = change[field];
          if (sent !== undefined) (after as Record<string, unknown>)[field] = sent;
        }
        const user = await userOf(tx, row.userId);
        const diff = diffOf(before, after, TRACKED, REGISTRABLE);
        if (!diff) return { outcome: 'ok', staff: toRecord(row, user) };

        const [updated] = await tx
          .update(staff)
          .set({ ...after, status: after.status as Row['status'], updatedAt: new Date() })
          .where(eq(staff.id, id))
          .returning();
        await audit.record(tx, { actor, action: 'staff.updated', entity: 'staff', entityId: id, diff });
        return { outcome: 'ok', staff: toRecord(updated!, user) };
      });
    } catch (error) {
      if (isUniqueViolation(error)) return { outcome: 'cpf_taken' };
      throw error;
    }
  }

  /** Inativa o funcionário: a linha, o vínculo e as fotos ficam. `false` se ele não existe; já inativo, nada muda. */
  async inactivate(id: string, actor: AuditActor): Promise<boolean> {
    if (!UUID.test(id)) return false;
    return this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(staff).where(identified(id)).for('update');
      if (!row) return false;
      if (row.status === 'inactive') return true;

      await tx.update(staff).set({ status: 'inactive', updatedAt: new Date() }).where(eq(staff.id, id));
      await audit.record(tx, {
        actor,
        action: 'staff.inactivated',
        entity: 'staff',
        entityId: id,
        diff: diffOf({ status: row.status }, { status: 'inactive' }, ['status'], REGISTRABLE),
      });
      return true;
    });
  }

  /**
   * Liga o funcionário ao usuário (door 1), trocando o vínculo que houver. O índice único de `user_id`
   * decide a corrida entre dois funcionários que querem o mesmo usuário; o mesmo usuário já ligado a
   * este funcionário não muda nada nem grava linha.
   */
  async link(id: string, userId: string, actor: AuditActor): Promise<LinkOutcome> {
    if (!UUID.test(id)) return 'not_found';
    try {
      return await this.db.transaction(async (tx): Promise<LinkOutcome> => {
        await lockActiveAdmins(tx);
        const [row] = await tx.select().from(staff).where(identified(id)).for('update');
        if (!row) return 'not_found';
        const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
        if (!user) return 'user_unknown';
        if (row.userId === user.id) return 'ok';

        await tx.update(staff).set({ userId: user.id, updatedAt: new Date() }).where(eq(staff.id, id));
        await audit.record(tx, {
          actor,
          action: 'staff.user_linked',
          entity: 'staff',
          entityId: id,
          diff: diffOf({ userId: row.userId }, { userId: user.id }, ['userId'], ['userId']),
        });
        return 'ok';
      });
    } catch (error) {
      if (isUniqueViolation(error)) return 'user_already_linked';
      throw error;
    }
  }

  /** Desfaz o vínculo; o usuário não é tocado. `false` se o funcionário não existe; sem vínculo, nada muda. */
  async unlink(id: string, actor: AuditActor): Promise<boolean> {
    if (!UUID.test(id)) return false;
    return this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(staff).where(identified(id)).for('update');
      if (!row) return false;
      if (row.userId === null) return true;

      await tx.update(staff).set({ userId: null, updatedAt: new Date() }).where(eq(staff.id, id));
      await audit.record(tx, {
        actor,
        action: 'staff.user_unlinked',
        entity: 'staff',
        entityId: id,
        diff: diffOf({ userId: row.userId }, { userId: null }, ['userId'], ['userId']),
      });
      return true;
    });
  }

  /**
   * A ficha, lida e auditada na mesma transação (door 5): `staff.viewed` entra antes de o dado sair, e
   * se a linha não entra a leitura falha. `undefined` se o funcionário não existe, sem gravar nada.
   */
  async find(id: string, actor: AuditActor): Promise<StaffRecord | undefined> {
    if (!UUID.test(id)) return undefined;
    return this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(staff).where(identified(id));
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
        .where(isNull(staff.anonymizedAt))
        .orderBy(sql`students_fold(${staff.name}) collate "C"`, staff.id);
      await audit.record(tx, { actor, action: 'staff.list_viewed', entity: 'staff', entityId: null });
      return rows.map((row) => ({ ...row, position: row.position! }));
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

// a ficha lida aqui é sempre identificada: `cpf`, `position`, `hiredAt` e `phone` existem (door 2 da privacidade)
const fieldsOf = (row: Row): Fields => ({
  name: row.name,
  cpf: row.cpf!,
  position: row.position!,
  department: row.department,
  hiredAt: row.hiredAt!,
  phone: row.phone!,
  email: row.email,
  status: row.status,
});

/** A ficha sem a foto; `user` é o usuário vinculado, lido na hora (door 1). */
const toRecord = (row: Row, user: StaffRecord['user']): StaffRecord => ({
  id: row.id,
  name: row.name,
  status: row.status,
  cpf: row.cpf!,
  position: row.position!,
  department: row.department,
  hiredAt: row.hiredAt!,
  phone: row.phone!,
  email: row.email,
  user,
});
