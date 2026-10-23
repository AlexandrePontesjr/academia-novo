import type { MailMessage, MailTransport } from '../../src/mail/mail.service.ts';

/**
 * O transporte de captura: entregue ao `MailService` na montagem do teste, guarda cada mensagem que a
 * API manda e permite fazer o envio falhar ou demorar. A mensagem entra em `sent` na hora da chamada,
 * antes de qualquer espera: o envio é disparado antes de a resposta HTTP sair.
 */
export function captureMail() {
  const sent: MailMessage[] = [];
  let mode: { kind: 'deliver' } | { kind: 'fail' } | { kind: 'delay'; ms: number } = { kind: 'deliver' };

  const transport: MailTransport = {
    async send(message) {
      sent.push(message);
      if (mode.kind === 'fail') throw new Error(`recusado para ${message.to}`);
      if (mode.kind === 'delay') {
        const { ms } = mode;
        await new Promise((resolve) => setTimeout(resolve, ms));
      }
    },
  };

  return {
    transport,
    sent,
    deliver: () => (mode = { kind: 'deliver' }),
    fail: () => (mode = { kind: 'fail' }),
    delay: (ms: number) => (mode = { kind: 'delay', ms }),
    clear: () => sent.splice(0),
  };
}

export type CapturedMail = ReturnType<typeof captureMail>;

/** O token do link de confirmação de uma mensagem, e o link inteiro. */
export function confirmLink(message: MailMessage, webOrigin: string) {
  const match = new RegExp(`${webOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/matricula/confirmar\\?token=([A-Za-z0-9_-]+)`).exec(message.text);
  if (!match) throw new Error('mensagem sem link de confirmação');
  return { link: match[0], token: match[1]! };
}
