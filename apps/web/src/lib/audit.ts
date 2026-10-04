import type { AuditAction, AuditLog, Role } from '@academia/contracts';
import { ROLE_LABELS } from './roles.ts';

/** O fuso das datas da tela: uma instalação por academia (AD-016), sem horário de verão desde 2019. */
const TIME_ZONE = 'America/Sao_Paulo';
const TIME_ZONE_OFFSET = '-03:00';
const DAY_MS = 86_400_000;

/** Os filtros da tela, com os nomes que vão para a query string de `/audit`. */
export const AUDIT_FILTERS = ['from', 'to', 'userId', 'action', 'ip'] as const;
export type AuditFilterValues = Record<(typeof AUDIT_FILTERS)[number], string>;

/** A ação por extenso, como aparece na tela. */
export const ACTION_LABELS: Record<AuditAction, string> = {
  'auth.login_succeeded': 'Login',
  'auth.login_failed': 'Falha de login',
  'auth.logout': 'Logout',
  'auth.password_changed': 'Troca da própria senha',
  'auth.two_factor_enabled': '2FA ativado',
  'auth.two_factor_disabled': '2FA desativado',
  'user.created': 'Usuário criado',
  'user.updated': 'Usuário editado',
  'user.password_reset': 'Senha redefinida',
  'user.two_factor_reset': '2FA zerado',
  'student.created': 'Aluno criado',
  'student.updated': 'Aluno editado',
  'student.inactivated': 'Aluno inativado',
};

export const actionLabel = (action: string) => ACTION_LABELS[action as AuditAction] ?? action;

const instantFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** `dd/MM/aaaa HH:mm:ss`, no fuso da tela. */
export function formatInstant(iso: string): string {
  const parts = Object.fromEntries(
    instantFormat.formatToParts(new Date(iso)).map((part) => [part.type, part.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * O instante em que um dia (`aaaa-mm-dd`) começa no fuso da tela, mais `days` dias. O que não é
 * um dia segue como veio: quem diz o que há de errado com ele é a API, no `422`.
 */
export function dayStart(day: string, days = 0): string {
  const start = DAY.test(day) ? new Date(`${day}T00:00:00${TIME_ZONE_OFFSET}`) : undefined;
  if (!start || Number.isNaN(start.getTime())) return day;
  return new Date(start.getTime() + days * DAY_MS).toISOString();
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  email: 'E-mail',
  role: 'Perfil',
  active: 'Situação',
  twoFactorEnabled: '2FA',
};

function valueLabel(field: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (field === 'role') return ROLE_LABELS[value as Role] ?? String(value);
  if (field === 'active') return value ? 'Ativo' : 'Inativo';
  if (field === 'twoFactorEnabled') return value ? 'Ativado' : 'Desativado';
  return String(value);
}

/**
 * O `diff` em frases: o antes e o depois dos campos que a trilha guarda, e só "alterado" para os
 * demais. Na criação não há antes: sai só o valor com que o registro nasceu.
 */
export function diffDetails({ action, diff }: Pick<AuditLog, 'action' | 'diff'>): string[] {
  if (!diff) return [];
  const created = action.endsWith('.created');
  return diff.fields.flatMap((field) => {
    const label = FIELD_LABELS[field] ?? field;
    const change = diff.values[field];
    if (created) return change ? [`${label}: ${valueLabel(field, change.to)}`] : [];
    if (!change) return [`${label} alterado`];
    return [`${label}: ${valueLabel(field, change.from)} → ${valueLabel(field, change.to)}`];
  });
}
