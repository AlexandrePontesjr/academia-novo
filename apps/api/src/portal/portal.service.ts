import { createHash, randomBytes } from 'node:crypto';
import { INVALID_PASSWORD_LINK_MESSAGE, isMinor, type PortalState, saoPauloToday } from '@academia/contracts';
import { and, type Database, eq, isNull, schema, sql } from '@academia/database';
import { audit, type AuditActor } from '../audit/audit.ts';
import { attemptPortal } from '../leads/lead-throttle.ts';
import { ACADEMY_NAME } from '../leads/leads.service.ts';
import type { MailService } from '../mail/mail.service.ts';
import { hashPassword } from '../password.ts';
import { ProblemException, validationProblem } from '../problem.filter.ts';

const { accounts, guardians, passwordTokens, sessions, students, users } = schema;

export const FIRST_ACCESS_SUBJECT = 'Crie sua senha do portal';
export const RESET_SUBJECT = 'Redefina sua senha do portal';

/** O Better Auth guarda a senha na conta `credential` do usuário. */
const CREDENTIAL = 'credential';

type Purpose = (typeof schema.PASSWORD_TOKEN_PURPOSES)[number];
type Tx = Parameters<Parameters<Database['db']['transaction']>[0]>[0];

/** Quanto cada link vale (door 2, AD-120). */
const VALIDITY: Record<Purpose, { interval: string; words: string }> = {
  first_access: { interval: '24 hours', words: '24 horas' },
  reset: { interval: '1 hour', words: '1 hora' },
};

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

const tooManyAttempts = (retryAfter: number) =>
  new ProblemException(429, 'too_many_attempts', { headers: { 'Retry-After': String(retryAfter) } });

const invalidLink = () => validationProblem([{ path: 'token', message: INVALID_PASSWORD_LINK_MESSAGE }]);

/** Um link de senha a enviar depois do commit. */
interface PasswordMail {
  userId: string;
  to: string;
  purpose: Purpose;
  token: string;
}

const logMailFailure = (userId: string) =>
  process.stderr.write(
    JSON.stringify({ level: 'error', time: new Date().toISOString(), msg: 'portal_mail_failed', userId }) + '\n',
  );

/**
 * O que a ficha e o usuário dela dizem sobre o primeiro acesso (AC 8, AC 12): `create` quando a ficha é
 * elegível e não tem usuário, `reuse` quando tem um sem senha ou desligado, `none` em toda recusa.
 */
export type FirstAccessDecision = 'create' | 'reuse' | 'none';

export interface FirstAccessFacts {
  emailMatches: boolean;
  status: 'active' | 'inactive' | 'suspended';
  anonymized: boolean;
  birthDate: string | null;
  today: string;
  hasGuardian: boolean;
  /** O e-mail é de outro usuário que não o da própria ficha. */
  emailOfAnotherUser: boolean;
  user: { active: boolean; hasPassword: boolean } | null;
}

export function firstAccessDecision(facts: FirstAccessFacts): FirstAccessDecision {
  if (!facts.emailMatches || facts.anonymized || facts.status === 'inactive') return 'none';
  if (facts.birthDate === null || isMinor(facts.birthDate, facts.today) || facts.hasGuardian) return 'none';
  if (facts.emailOfAnotherUser) return 'none';
  if (!facts.user) return 'create';
  return facts.user.active && facts.user.hasPassword ? 'none' : 'reuse';
}

/**
 * O acesso do aluno ao portal (AC 15), pelo usuário dele: sem usuário, `none`; sem senha, `pending` (ativo
 * ou não); com senha, `active` ou `disabled` conforme `users.active`.
 */
export function portalState(user: { active: boolean; hasPassword: boolean } | null): PortalState {
  if (!user) return 'none';
  if (!user.hasPassword) return 'pending';
  return user.active ? 'active' : 'disabled';
}

/**
 * O portal público do aluno: o primeiro acesso, a redefinição e o consumo do link de senha (doors 1, 2 e
 * 4). A contagem do limite, a decisão e a escrita estão numa transação só; o e-mail sai depois do commit,
 * sem segurar a resposta, e a resposta não diz qual foi o caso.
 */
export class PortalService {
  constructor(
    private readonly db: Database['db'],
    private readonly mail: MailService,
    private readonly webOrigin: string,
  ) {}

  async requestFirstAccess(input: { cpf: string; email: string }, actor: AuditActor): Promise<void> {
    const outgoing = await this.db.transaction(async (tx) => {
      for (const [kind, value] of [['access-ip', actor.ip ?? 'desconhecido'], ['access-cpf', input.cpf]] as const) {
        const attempt = await attemptPortal(tx, kind, value);
        if (!attempt.allowed) throw tooManyAttempts(attempt.retryAfter);
      }

      // a ficha travada: dois pedidos simultâneos do mesmo aluno se enfileiram aqui
      const [student] = await tx.select().from(students).where(eq(students.cpf, input.cpf)).for('update');
      if (!student) return undefined;
      const [guardian] = await tx.select({ id: guardians.id }).from(guardians).where(eq(guardians.studentId, student.id)).limit(1);
      const [own] = await tx
        .select({ id: users.id, active: users.active, password: accounts.password })
        .from(users)
        .leftJoin(accounts, and(eq(accounts.userId, users.id), eq(accounts.providerId, CREDENTIAL)))
        .where(eq(users.studentId, student.id));
      const [other] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, input.email), sql`${users.studentId} is distinct from ${student.id}`));

      const decision = firstAccessDecision({
        emailMatches: student.email !== null && student.email.trim().toLowerCase() === input.email,
        status: student.status,
        anonymized: student.anonymizedAt !== null,
        birthDate: student.birthDate,
        today: saoPauloToday(),
        hasGuardian: guardian !== undefined,
        emailOfAnotherUser: other !== undefined,
        user: own ? { active: own.active, hasPassword: typeof own.password === 'string' } : null,
      });
      if (decision === 'none') return undefined;

      let userId = own?.id;
      if (decision === 'create') {
        const [created] = await tx
          .insert(users)
          .values({ name: student.name, email: input.email, role: 'student', studentId: student.id, active: false })
          .returning({ id: users.id });
        userId = created!.id;
      }
      const token = await this.issueToken(tx, userId!, 'first_access');
      await audit.record(tx, {
        actor: { ...actor, userId: null },
        action: 'student.portal_access_requested',
        entity: 'student',
        entityId: student.id,
      });
      // o link vai para o e-mail da ficha, que é o que prova a identidade
      return { userId: userId!, to: student.email!, purpose: 'first_access', token } satisfies PasswordMail;
    });

    if (outgoing) this.deliver(outgoing);
  }

  async requestReset(input: { email: string }, actor: AuditActor): Promise<void> {
    const outgoing = await this.db.transaction(async (tx) => {
      for (const [kind, value] of [['reset-ip', actor.ip ?? 'desconhecido'], ['reset-email', input.email]] as const) {
        const attempt = await attemptPortal(tx, kind, value);
        if (!attempt.allowed) throw tooManyAttempts(attempt.retryAfter);
      }

      // só o usuário de aluno ativo com senha definida: o resto é o mesmo `202` sem nada gravado
      const [user] = await tx
        .select({ id: users.id, studentId: users.studentId })
        .from(users)
        .innerJoin(accounts, and(eq(accounts.userId, users.id), eq(accounts.providerId, CREDENTIAL)))
        .where(and(eq(users.email, input.email), eq(users.role, 'student'), eq(users.active, true), sql`${accounts.password} is not null`))
        .for('update', { of: users });
      if (!user) return undefined;

      const token = await this.issueToken(tx, user.id, 'reset');
      await audit.record(tx, {
        actor: { ...actor, userId: null },
        action: 'student.portal_reset_requested',
        entity: 'student',
        entityId: user.studentId,
      });
      return { userId: user.id, to: input.email, purpose: 'reset', token } satisfies PasswordMail;
    });

    if (outgoing) this.deliver(outgoing);
  }

  /**
   * Define a senha pelo link (AC 18 a 22): o token travado, aberto, no prazo e de uma ficha que não foi
   * inativada nem anonimizada depois de emitido. Grava a senha na conta `credential` (criando-a no
   * primeiro acesso), liga o usuário, marca o uso e derruba as sessões dele, tudo na transação.
   */
  async consume(input: { token: string; password: string }, actor: AuditActor): Promise<void> {
    const hash = await hashPassword(input.password);
    await this.db.transaction(async (tx) => {
      const [found] = await tx
        .select({
          id: passwordTokens.id,
          userId: passwordTokens.userId,
          studentId: users.studentId,
          usable: sql<boolean>`${passwordTokens.usedAt} is null and ${passwordTokens.expiresAt} > now()`,
          studentStatus: students.status,
          anonymized: sql<boolean>`${students.anonymizedAt} is not null`,
        })
        .from(passwordTokens)
        .innerJoin(users, eq(users.id, passwordTokens.userId))
        .innerJoin(students, eq(students.id, users.studentId))
        .where(eq(passwordTokens.tokenHash, tokenHash(input.token)))
        .for('update', { of: [passwordTokens, users] });
      if (!found || !found.usable || found.studentStatus === 'inactive' || found.anonymized) throw invalidLink();

      const updated = await tx
        .update(accounts)
        .set({ password: hash, updatedAt: new Date() })
        .where(and(eq(accounts.userId, found.userId), eq(accounts.providerId, CREDENTIAL)))
        .returning({ id: accounts.id });
      if (updated.length === 0) {
        await tx.insert(accounts).values({ userId: found.userId, accountId: found.userId, providerId: CREDENTIAL, password: hash });
      }
      await tx.update(users).set({ active: true, updatedAt: new Date() }).where(eq(users.id, found.userId));
      await tx.update(passwordTokens).set({ usedAt: sql`now()` }).where(eq(passwordTokens.id, found.id));
      await tx.delete(sessions).where(eq(sessions.userId, found.userId));
      await audit.record(tx, {
        actor: { ...actor, userId: null },
        action: 'student.portal_password_set',
        entity: 'student',
        entityId: found.studentId,
      });
    });
  }

  /** A ficha do aluno da sessão: `/api/me/*` nunca toma o aluno do caminho, da query nem do corpo (AC 32). */
  async studentIdOf(userId: string): Promise<string> {
    const [user] = await this.db.select({ studentId: users.studentId }).from(users).where(eq(users.id, userId));
    return user!.studentId!;
  }

  /** O estado do portal de uma ficha, para `GET /api/students/:id`. */
  async portalOf(studentId: string): Promise<PortalState> {
    const [user] = await this.db
      .select({ active: users.active, password: accounts.password })
      .from(users)
      .leftJoin(accounts, and(eq(accounts.userId, users.id), eq(accounts.providerId, CREDENTIAL)))
      .where(eq(users.studentId, studentId));
    return portalState(user ? { active: user.active, hasPassword: typeof user.password === 'string' } : null);
  }

  /** Marca os abertos do mesmo usuário e propósito como usados e grava um novo; só o hash fica no banco. */
  private async issueToken(tx: Tx, userId: string, purpose: Purpose) {
    await tx
      .update(passwordTokens)
      .set({ usedAt: sql`now()` })
      .where(and(eq(passwordTokens.userId, userId), eq(passwordTokens.purpose, purpose), isNull(passwordTokens.usedAt)));
    const token = randomBytes(32).toString('base64url');
    await tx.insert(passwordTokens).values({
      userId,
      purpose,
      tokenHash: tokenHash(token),
      createdAt: sql`now()`,
      expiresAt: sql`now() + ${VALIDITY[purpose].interval}::interval`,
    });
    return token;
  }

  /** Envia o link sem esperar; a falha vira uma linha de log com o id do usuário, nunca com o endereço. */
  private deliver({ userId, to, purpose, token }: PasswordMail) {
    const link = `${this.webOrigin}/definir-senha?token=${token}`;
    const closing = `O link vale por ${VALIDITY[purpose].words}. Se você não pediu, ignore este e-mail.`;
    const intro =
      purpose === 'first_access'
        ? `Recebemos seu pedido de acesso ao portal do aluno da ${ACADEMY_NAME}. Para criar sua senha, abra o link:`
        : `Recebemos seu pedido para redefinir a senha do portal do aluno da ${ACADEMY_NAME}. Para criar uma senha nova, abra o link:`;
    this.mail
      .send({
        to,
        subject: purpose === 'first_access' ? FIRST_ACCESS_SUBJECT : RESET_SUBJECT,
        text: `Olá.\n\n${intro}\n${link}\n\n${closing}\n`,
        html: `<p>Olá.</p><p>${intro} <a href="${link}">${link}</a></p><p>${closing}</p>`,
      })
      .catch(() => logMailFailure(userId));
  }
}
