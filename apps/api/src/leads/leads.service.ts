import { createHash, randomBytes } from 'node:crypto';
import {
  type CreateLeadRequest,
  INVALID_LINK_MESSAGE,
  type Lead,
  type LeadCreatedResponse,
  type LeadOptionsResponse,
  type LeadSource,
  type LeadStatus,
  type UpdateLeadRequest,
} from '@academia/contracts';
import { and, type Database, desc, eq, inArray, ne, schema, sql } from '@academia/database';
import { audit, type AuditActor, diffOf } from '../audit/audit.ts';
import { isUniqueViolation } from '../db-errors.ts';
import type { MailService } from '../mail/mail.service.ts';
import { ProblemException, validationProblem } from '../problem.filter.ts';
import { attemptLead } from './lead-throttle.ts';

const { consentTerms, leads, leadVerifications } = schema;

/** O nome da academia no e-mail; o mesmo de `SITE.name` no web. */
export const ACADEMY_NAME = 'DukFit';
export const CONFIRM_SUBJECT = 'Confirme seu pré-cadastro';

const OPEN = ['new', 'contacted'] as const;
/** Os campos de `lead` cuja trilha guarda o valor (door 8): nunca nome, e-mail nem telefone. */
const REGISTRABLE = ['source', 'status'] as const;

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

type Tx = Parameters<Parameters<Database['db']['transaction']>[0]>[0];
type Row = typeof leads.$inferSelect;

/** O interessado como a equipe o vê: sem `consent_*` nem `updated_at`. */
const toLead = (row: Row): Lead => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  source: row.source,
  status: row.status,
  emailVerified: row.emailVerifiedAt !== null,
  createdAt: row.createdAt.toISOString(),
  studentId: row.studentId,
});

/** A linha de `lead.status_changed`: só `status`, com o valor de antes e o de depois (door 8). */
const recordStatusChange = (tx: Tx, actor: AuditActor, id: string, from: LeadStatus, to: LeadStatus) =>
  audit.record(tx, {
    actor,
    action: 'lead.status_changed',
    entity: 'lead',
    entityId: id,
    diff: diffOf({ status: from }, { status: to }, ['status'], REGISTRABLE),
  });

export type LeadChange =
  | { outcome: 'ok'; lead: Lead }
  | { outcome: 'not_found' }
  /** Convertido não muda mais de situação. */
  | { outcome: 'lead_converted' }
  /** Reabrir esbarra noutro interessado aberto do mesmo e-mail (door 1). */
  | { outcome: 'lead_email_open' };

/**
 * A primeira metade da conversão (door 9), dentro da transação do aluno: trava o interessado. Só um
 * aberto converte; dois cadastros com o mesmo `leadId` se enfileiram aqui, e o segundo o lê convertido.
 */
export async function lockLeadToConvert(tx: Tx, leadId: string): Promise<'ok' | 'not_found' | 'lead_converted'> {
  const [row] = await tx.select({ status: leads.status }).from(leads).where(eq(leads.id, leadId)).for('update');
  if (!row) return 'not_found';
  return (OPEN as readonly string[]).includes(row.status) ? 'ok' : 'lead_converted';
}

/** A segunda metade, depois do insert do aluno: `converted` com o aluno, e a linha da trilha. */
export async function convertLead(tx: Tx, leadId: string, studentId: string, actor: AuditActor) {
  const [before] = await tx.select({ status: leads.status }).from(leads).where(eq(leads.id, leadId));
  await tx.update(leads).set({ status: 'converted', studentId }).where(eq(leads.id, leadId));
  await recordStatusChange(tx, actor, leadId, before!.status, 'converted');
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const tooManyAttempts = (retryAfter: number) =>
  new ProblemException(429, 'too_many_attempts', { headers: { 'Retry-After': String(retryAfter) } });

const invalidLink = () => validationProblem([{ path: 'token', message: INVALID_LINK_MESSAGE }]);

/** Nome e e-mail que o Google confirmou (door 7): o e-mail em minúsculas. */
export interface GoogleProfile {
  name: string;
  email: string;
}

/** Um e-mail de confirmação a enviar depois do commit. */
interface Confirmation {
  leadId: string;
  to: string;
  name: string;
  token: string;
}

const logMailFailure = (leadId: string) =>
  process.stderr.write(
    JSON.stringify({ level: 'error', time: new Date().toISOString(), msg: 'lead_mail_failed', leadId }) + '\n',
  );

/** O pré-cadastro público: criar ou atualizar o interessado aberto, e confirmar o e-mail dele. */
export class LeadsService {
  constructor(
    private readonly db: Database['db'],
    private readonly mail: MailService,
    private readonly webOrigin: string,
    private readonly googleEnabled: boolean,
  ) {}

  /** Se o Google está ligado e o termo vigente de `data_processing`, a maior versão. */
  async options(): Promise<LeadOptionsResponse> {
    const [term] = await this.db
      .select({ version: consentTerms.version, text: consentTerms.text })
      .from(consentTerms)
      .where(eq(consentTerms.purpose, 'data_processing'))
      .orderBy(desc(consentTerms.version))
      .limit(1);
    return { google: this.googleEnabled, term: term! };
  }

  /**
   * Um envio do formulário. Sem o Google: o e-mail novo, ou o de um interessado fechado, cria um
   * interessado; o de um aberto não confirmado atualiza nome e telefone dele e manda outro link; o de um
   * aberto confirmado não muda nada. Com o perfil do Google, o interessado nasce ou passa a confirmado,
   * sem link. A resposta não diz qual foi o caso (AC 26). A contagem do limite, o termo e a escrita
   * estão numa transação só; o e-mail sai depois do commit, sem segurar a resposta.
   */
  async create(input: CreateLeadRequest, actor: AuditActor, google?: GoogleProfile): Promise<LeadCreatedResponse> {
    const email = google?.email ?? input.email;
    const name = google?.name ?? input.name;
    const source: LeadSource = google ? 'google' : 'form';

    const confirmation = await this.db.transaction(async (tx) => {
      for (const [kind, value] of [['ip', actor.ip ?? 'desconhecido'], ['email', email]] as const) {
        const attempt = await attemptLead(tx, kind, value);
        if (!attempt.allowed) throw tooManyAttempts(attempt.retryAfter);
      }

      const [current] = await tx
        .select({ version: sql<number>`max(${consentTerms.version})` })
        .from(consentTerms)
        .where(eq(consentTerms.purpose, 'data_processing'));
      if (input.termVersion !== current?.version) {
        throw validationProblem([{ path: 'termVersion', message: 'O termo mudou. Recarregue a página e aceite o termo vigente.' }]);
      }

      const findOpen = () =>
        tx
          .select()
          .from(leads)
          .where(and(eq(leads.email, email), inArray(leads.status, [...OPEN])))
          .for('update');

      let [open] = await findOpen();
      if (!open) {
        const [created] = await tx
          .insert(leads)
          .values({
            name,
            email,
            phone: input.phone,
            source,
            consentPurpose: 'data_processing',
            consentTermVersion: input.termVersion,
            ...(google && { emailVerifiedAt: sql`now()` }),
          })
          // dois envios simultâneos do mesmo e-mail novo: o segundo espera o primeiro e segue como reenvio
          .onConflictDoNothing({ target: leads.email, where: sql`${leads.status} in ('new', 'contacted')` })
          .returning();
        if (created) {
          await audit.record(tx, {
            actor,
            action: 'lead.created',
            entity: 'lead',
            entityId: created.id,
            diff: diffOf(null, { source: created.source, status: created.status }, REGISTRABLE, REGISTRABLE),
          });
          return google ? undefined : await this.issueToken(tx, created.id, email, name);
        }
        [open] = await findOpen();
      }

      // reenvio para um aberto: sem linha na trilha (door 8)
      if (open!.emailVerifiedAt !== null) return undefined;
      await tx
        .update(leads)
        .set({
          name,
          phone: input.phone,
          updatedAt: sql`now()`,
          ...(google && { source, emailVerifiedAt: sql`now()` }),
        })
        .where(eq(leads.id, open!.id));
      return google ? undefined : await this.issueToken(tx, open!.id, email, name);
    });

    if (confirmation) this.deliver(confirmation);
    return { status: google ? 'confirmed' : 'pending' };
  }

  /**
   * Confirma o e-mail pelo token do link. Um token usado, ou o irmão de outro já usado, de um
   * interessado confirmado responde como sucesso sem mudar nada; vencido, desconhecido, de interessado
   * apagado ou usado sem confirmação é o mesmo `422`.
   */
  async confirm(token: string, actor: AuditActor): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [found] = await tx
        .select({
          id: leadVerifications.id,
          leadId: leadVerifications.leadId,
          used: sql<boolean>`${leadVerifications.usedAt} is not null`,
          expired: sql<boolean>`${leadVerifications.expiresAt} <= now()`,
          verified: sql<boolean>`${leads.emailVerifiedAt} is not null`,
        })
        .from(leadVerifications)
        .innerJoin(leads, eq(leads.id, leadVerifications.leadId))
        .where(eq(leadVerifications.tokenHash, tokenHash(token)))
        .for('update');
      if (!found) throw invalidLink();
      if (found.verified && (found.used || !found.expired)) return;
      if (found.used || found.expired) throw invalidLink();

      await tx.update(leadVerifications).set({ usedAt: sql`now()` }).where(eq(leadVerifications.id, found.id));
      await tx.update(leads).set({ emailVerifiedAt: sql`now()`, updatedAt: sql`now()` }).where(eq(leads.id, found.leadId));
      await audit.record(tx, { actor, action: 'lead.confirmed', entity: 'lead', entityId: found.leadId });
    });
  }

  /** Os interessados de uma situação, ou os abertos; do mais recente para o mais antigo, e no empate por `id`. */
  async list(status: LeadStatus | undefined): Promise<Lead[]> {
    const rows = await this.db
      .select()
      .from(leads)
      .where(status ? eq(leads.status, status) : inArray(leads.status, [...OPEN]))
      .orderBy(desc(leads.createdAt), desc(leads.id));
    return rows.map(toLead);
  }

  /**
   * Muda a situação pela equipe, com a linha travada. A mesma situação responde sem gravar; convertido
   * não muda; reabrir um descartado exige que o e-mail não tenha outro aberto.
   */
  async update(id: string, change: UpdateLeadRequest, actor: AuditActor): Promise<LeadChange> {
    if (!UUID.test(id)) return { outcome: 'not_found' };
    try {
      return await this.db.transaction(async (tx): Promise<LeadChange> => {
        const [row] = await tx.select().from(leads).where(eq(leads.id, id)).for('update');
        if (!row) return { outcome: 'not_found' };
        if (row.status === 'converted') return { outcome: 'lead_converted' };
        if (row.status === change.status) return { outcome: 'ok', lead: toLead(row) };

        if (row.status === 'discarded') {
          const [sibling] = await tx
            .select({ id: leads.id })
            .from(leads)
            .where(and(eq(leads.email, row.email), inArray(leads.status, [...OPEN]), ne(leads.id, id)));
          if (sibling) return { outcome: 'lead_email_open' };
        }

        const [updated] = await tx
          .update(leads)
          // `updated_at` é o último envio do interessado; a mudança da equipe fica na trilha
          .set({ status: change.status })
          .where(eq(leads.id, id))
          .returning();
        await recordStatusChange(tx, actor, id, row.status, change.status);
        return { outcome: 'ok', lead: toLead(updated!) };
      });
    } catch (error) {
      // o aberto do mesmo e-mail nasceu entre a leitura e a escrita: o índice da door 1 decide
      if (isUniqueViolation(error)) return { outcome: 'lead_email_open' };
      throw error;
    }
  }

  /** Um token novo para o interessado: só o hash fica no banco, e vale 24 horas pelo relógio dele. */
  private async issueToken(tx: Pick<Database['db'], 'insert'>, leadId: string, to: string, name: string): Promise<Confirmation> {
    const token = randomBytes(32).toString('base64url');
    await tx.insert(leadVerifications).values({
      leadId,
      tokenHash: tokenHash(token),
      createdAt: sql`now()`,
      expiresAt: sql`now() + interval '24 hours'`,
    });
    return { leadId, to, name, token };
  }

  /** Envia o link sem esperar; a falha vira uma linha de log com o id do interessado, nunca com o endereço. */
  private deliver({ leadId, to, name, token }: Confirmation) {
    const link = `${this.webOrigin}/matricula/confirmar?token=${token}`;
    const closing = 'O link vale por 24 horas. Se você não pediu, ignore este e-mail.';
    this.mail
      .send({
        to,
        subject: CONFIRM_SUBJECT,
        text: `Olá, ${name}.\n\nRecebemos seu pré-cadastro na ${ACADEMY_NAME}. Para confirmar seu e-mail, abra o link:\n${link}\n\n${closing}\n`,
        html: `<p>Olá, ${escapeHtml(name)}.</p><p>Recebemos seu pré-cadastro na ${ACADEMY_NAME}. Para confirmar seu e-mail, abra o link: <a href="${link}">${link}</a></p><p>${closing}</p>`,
      })
      .catch(() => logMailFailure(leadId));
  }
}
