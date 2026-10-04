import type { CreateUserRequest, UpdateUserRequest, User } from '@academia/contracts';
import { and, type Database, eq, ne, schema } from '@academia/database';
import { audit, type AuditActor, diffOf, NO_ACTOR } from '../audit/audit.ts';
import { hashPassword, verifyPassword } from '../password.ts';

const { accounts, sessions, twoFactors, users } = schema;

const publicColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  active: users.active,
  twoFactorEnabled: users.twoFactorEnabled,
};

/** O Better Auth guarda a senha na conta `credential` do usuário. */
const CREDENTIAL = 'credential';

/** Os campos de `user` cujo valor a trilha de auditoria guarda (AD-026); dos demais, só o nome. */
const REGISTRABLE = ['role', 'active', 'twoFactorEnabled'];

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const byName = new Intl.Collator('pt-BR');

export type UserChange =
  | { outcome: 'ok'; user: User }
  | { outcome: 'not_found' }
  | { outcome: 'last_admin' };

/** Leitura e escrita de `users` e do que pende dele (`accounts`, `sessions`, `two_factors`). */
export class UsersService {
  constructor(private readonly db: Database['db']) {}

  async list(): Promise<User[]> {
    const rows = await this.db.select(publicColumns).from(users);
    return rows.sort((a, b) => byName.compare(a.name, b.name));
  }

  /** O que o login precisa saber antes de conferir a senha. */
  async findByEmail(email: string) {
    const [user] = await this.db
      .select({ id: users.id, email: users.email, active: users.active })
      .from(users)
      .where(eq(users.email, email));
    return user;
  }

  async findEmailById(id: string) {
    const [user] = await this.db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, id));
    return user;
  }

  /**
   * Cria o usuário e a senha dele numa transação; `null` quando o e-mail já existe. Sem `actor`, a
   * linha de auditoria sai sem autor: é o caso do `users:create-admin`.
   */
  async create(input: CreateUserRequest, actor: AuditActor = NO_ACTOR): Promise<User | null> {
    const password = await hashPassword(input.password);
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ name: input.name, email: input.email.toLowerCase(), role: input.role })
        .onConflictDoNothing({ target: users.email })
        .returning(publicColumns);
      if (!user) return null;
      await tx
        .insert(accounts)
        .values({ userId: user.id, accountId: user.id, providerId: CREDENTIAL, password });
      await audit.record(tx, {
        actor,
        action: 'user.created',
        entity: 'user',
        entityId: user.id,
        diff: diffOf(null, user, ['name', 'email', 'role'], REGISTRABLE),
      });
      return user;
    });
  }

  /**
   * Altera nome, perfil ou situação. As linhas dos administradores ativos são travadas antes da
   * mudança: de duas alterações simultâneas que tirariam os dois últimos, a segunda espera a
   * primeira e já não encontra outro administrador.
   */
  async update(id: string, change: UpdateUserRequest, actor: AuditActor): Promise<UserChange> {
    if (!UUID.test(id)) return { outcome: 'not_found' };
    return this.db.transaction(async (tx) => {
      const admins = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'admin'), eq(users.active, true)))
        .orderBy(users.id)
        .for('update');
      const [current] = await tx.select(publicColumns).from(users).where(eq(users.id, id)).for('update');
      if (!current) return { outcome: 'not_found' };

      const next = { ...current, ...change };
      const diff = diffOf(current, next, ['name', 'role', 'active'], REGISTRABLE);
      // nada mudou: nada a gravar, nem em `users` nem na trilha
      if (!diff) return { outcome: 'ok', user: current };
      const wasAdmin = admins.some((admin) => admin.id === id);
      const staysAdmin = next.role === 'admin' && next.active;
      if (wasAdmin && !staysAdmin && admins.length === 1) return { outcome: 'last_admin' };

      const [user] = await tx
        .update(users)
        .set({ name: next.name, role: next.role, active: next.active, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning(publicColumns);
      if (next.role !== current.role || (current.active && !next.active)) {
        await tx.delete(sessions).where(eq(sessions.userId, id));
      }
      await audit.record(tx, { actor, action: 'user.updated', entity: 'user', entityId: id, diff });
      return { outcome: 'ok', user: user! };
    });
  }

  /** O Administrador redefine a senha de alguém: as sessões daquele usuário caem. */
  async resetPassword(id: string, password: string, actor: AuditActor): Promise<boolean> {
    if (!UUID.test(id)) return false;
    const hash = await hashPassword(password);
    return this.db.transaction(async (tx) => {
      const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, id));
      if (!user) return false;
      await this.storePassword(tx, id, hash);
      await tx.delete(sessions).where(eq(sessions.userId, id));
      await audit.record(tx, { actor, action: 'user.password_reset', entity: 'user', entityId: id });
      return true;
    });
  }

  /** O próprio usuário troca a senha: a sessão em uso fica, as demais caem. */
  async changeOwnPassword(
    user: { id: string; sessionId: string },
    currentPassword: string,
    newPassword: string,
    actor: AuditActor,
  ): Promise<boolean> {
    const [account] = await this.db
      .select({ password: accounts.password })
      .from(accounts)
      .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, CREDENTIAL)));
    if (!account?.password || !(await verifyPassword(account.password, currentPassword))) return false;

    const hash = await hashPassword(newPassword);
    await this.db.transaction(async (tx) => {
      await this.storePassword(tx, user.id, hash);
      await tx.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, user.sessionId)));
      await audit.record(tx, { actor, action: 'auth.password_changed', entity: 'user', entityId: user.id });
    });
    return true;
  }

  /** Apaga o segredo TOTP e os códigos de recuperação de alguém e encerra as sessões dele. */
  async resetTwoFactor(id: string, actor: AuditActor): Promise<boolean> {
    if (!UUID.test(id)) return false;
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .update(users)
        .set({ twoFactorEnabled: false, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning({ id: users.id });
      if (!user) return false;
      await tx.delete(twoFactors).where(eq(twoFactors.userId, id));
      await tx.delete(sessions).where(eq(sessions.userId, id));
      await audit.record(tx, { actor, action: 'user.two_factor_reset', entity: 'user', entityId: id });
      return true;
    });
  }

  private async storePassword(tx: Pick<Database['db'], 'update'>, userId: string, hash: string) {
    await tx
      .update(accounts)
      .set({ password: hash, updatedAt: new Date() })
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, CREDENTIAL)));
  }
}
