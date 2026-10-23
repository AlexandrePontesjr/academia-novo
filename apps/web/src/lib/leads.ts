import type { LeadSource, LeadStatus, Role } from '@academia/contracts';

/** Quem vê e marca interessados: todos menos o Instrutor (pre-cadastro, AC 47). */
export const canReadLeads = (role: Role) => role !== 'instructor';

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Novo',
  contacted: 'Contatado',
  converted: 'Matriculado',
  discarded: 'Descartado',
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = { form: 'Formulário', google: 'Google' };

/** As mensagens dos dois `409` de interessado, na lista e no cadastro do aluno (AC 56). */
export const LEAD_CONFLICT_MESSAGES: Record<string, string> = {
  lead_converted: 'Este interessado já foi matriculado.',
  lead_email_open: 'Já existe um pré-cadastro em aberto com este e-mail.',
};

const receivedFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `dd/MM/aaaa HH:mm` em `America/Sao_Paulo`: quando o pré-cadastro chegou. */
export function formatReceivedAt(iso: string): string {
  const parts = Object.fromEntries(receivedFormat.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}
