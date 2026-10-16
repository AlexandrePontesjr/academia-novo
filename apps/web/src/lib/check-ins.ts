import type { CheckInBlockReason, Role } from '@academia/contracts';

/** Quem registra presença e lê o histórico e o relatório: o balcão (PRD §2). */
export const canCheckIn = (role: Role) => role === 'admin' || role === 'reception';

/** O motivo de bloqueio por extenso, como aparece no cartão. */
export const BLOCK_REASON_LABELS: Record<CheckInBlockReason, string> = {
  student_inactive: 'Aluno inativo',
  student_suspended: 'Aluno suspenso',
  no_active_enrollment: 'Sem matrícula vigente',
};

const timeFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `HH:mm` de um instante, no fuso da academia. */
export const formatTime = (iso: string) => timeFormat.format(new Date(iso));
