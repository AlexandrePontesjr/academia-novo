import nodemailer from 'nodemailer';
import type { Env } from '../env.ts';

/** Quanto um envio pode levar até contar como falha (door 5). */
export const MAIL_TIMEOUT_MS = 10_000;

export const MAIL_NOT_SENT = 'e-mail não enviado: SMTP não configurado';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Quem entrega a mensagem: o SMTP de verdade, o log, ou o de captura dos testes. */
export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

const log = (fields: Record<string, unknown>) =>
  process.stdout.write(JSON.stringify({ level: 'info', time: new Date().toISOString(), ...fields }) + '\n');

/** SMTP pelo `nodemailer`, com as variáveis da door 6; autentica só quando usuário e senha existem. */
export class SmtpTransport implements MailTransport {
  private readonly transporter;

  constructor(
    env: Pick<Env, 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_SECURE' | 'SMTP_USER' | 'SMTP_PASS'>,
    private readonly from: string,
  ) {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER !== undefined && { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }),
      connectionTimeout: MAIL_TIMEOUT_MS,
      greetingTimeout: MAIL_TIMEOUT_MS,
      socketTimeout: MAIL_TIMEOUT_MS,
    });
  }

  async send(message: MailMessage) {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}

/**
 * Sem `SMTP_HOST` a mensagem não sai: fica uma linha de log, e fora de produção os links dela, para
 * quem desenvolve confirmar o e-mail. O destinatário nunca vai para o log.
 */
export class LogTransport implements MailTransport {
  async send(message: MailMessage) {
    const production = process.env.NODE_ENV === 'production';
    log({ msg: MAIL_NOT_SENT, ...(!production && { links: message.text.match(/https?:\/\/\S+/g) ?? [] }) });
  }
}

export function mailTransportFor(env: Env): MailTransport {
  return env.SMTP_HOST !== undefined && env.MAIL_FROM !== undefined
    ? new SmtpTransport(env, env.MAIL_FROM)
    : new LogTransport();
}

/** O envio de e-mail da API (door 5): uma mensagem por chamada, recusada se passa de 10 s. */
export class MailService {
  constructor(
    private readonly transport: MailTransport,
    private readonly timeoutMs = MAIL_TIMEOUT_MS,
  ) {}

  send(message: MailMessage): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('envio de e-mail passou do tempo limite')), this.timeoutMs);
    });
    return Promise.race([this.transport.send(message), timeout]).finally(() => clearTimeout(timer));
  }
}
