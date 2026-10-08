import type {
  AuditAction,
  AuditLog,
  ConsentGrantor,
  ConsentPurpose,
  Role,
  StudentStatus,
  User,
} from '@academia/contracts';
import { GRANTOR_LABELS, PURPOSE_LABELS } from './consents.ts';
import { ROLE_LABELS } from './roles.ts';
import { STATUS_LABELS } from './students.ts';

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
  'student.guardian_saved': 'Responsável do aluno salvo',
  'student.consent_granted': 'Consentimento registrado',
  'student.consent_revoked': 'Consentimento revogado',
  'student.photo_uploaded': 'Foto do aluno enviada',
  'student.photo_removed': 'Foto do aluno removida',
  'student.photo_replaced': 'Foto do aluno trocada',
  'student.photo_version_purged': 'Versão anterior da foto excluída',
  'staff.created': 'Funcionário criado',
  'staff.updated': 'Funcionário editado',
  'staff.inactivated': 'Funcionário inativado',
  'staff.viewed': 'Ficha de funcionário visualizada',
  'staff.list_viewed': 'Lista de funcionários visualizada',
  'staff.user_linked': 'Usuário vinculado ao funcionário',
  'staff.user_unlinked': 'Usuário desvinculado do funcionário',
  'staff.photo_uploaded': 'Foto do funcionário enviada',
  'staff.photo_removed': 'Foto do funcionário removida',
  'staff.photo_replaced': 'Foto do funcionário trocada',
  'staff.photo_version_purged': 'Versão anterior da foto do funcionário excluída',
  'plan.created': 'Plano criado',
  'plan.updated': 'Plano editado',
  'plan.inactivated': 'Plano inativado',
  'student.enrollment_created': 'Matrícula registrada',
  'student.enrollment_cancelled': 'Matrícula cancelada',
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
  // aluno: a trilha guarda o valor só de `status`; dos demais, o nome do campo
  status: 'Situação',
  cpf: 'CPF',
  birthDate: 'Data de nascimento',
  sex: 'Sexo',
  phone: 'Telefone',
  address: 'Endereço',
  emergencyContactName: 'Contato de emergência (nome)',
  emergencyContactPhone: 'Contato de emergência (telefone)',
  healthNotes: 'Observações de saúde',
  // responsável e consentimento: a trilha guarda o valor só de `purpose`, `termVersion` e `grantedBy`
  relationship: 'Parentesco',
  purpose: 'Finalidade',
  termVersion: 'Versão do termo',
  grantedBy: 'Concedido por',
  // funcionário: a trilha guarda o valor só de `status` e de `userId`; dos demais, o nome do campo
  position: 'Cargo',
  department: 'Setor',
  hiredAt: 'Data de admissão',
  userId: 'Usuário vinculado',
};

function valueLabel(field: string, value: unknown, users: UserNames): string {
  if (value === null || value === undefined) return '—';
  // a trilha guarda o id do usuário: a tela mostra o nome de agora, ou o id se o usuário não está na lista
  if (field === 'userId') return users.find((user) => user.id === value)?.name ?? String(value);
  if (field === 'role') return ROLE_LABELS[value as Role] ?? String(value);
  if (field === 'active') return value ? 'Ativo' : 'Inativo';
  if (field === 'status') return STATUS_LABELS[value as StudentStatus] ?? String(value);
  if (field === 'twoFactorEnabled') return value ? 'Ativado' : 'Desativado';
  if (field === 'purpose') return PURPOSE_LABELS[value as ConsentPurpose] ?? String(value);
  if (field === 'grantedBy') return GRANTOR_LABELS[value as ConsentGrantor] ?? String(value);
  return String(value);
}

type UserNames = Array<Pick<User, 'id' | 'name'>>;

/**
 * O `diff` em frases: o antes e o depois dos campos que a trilha guarda, e só "alterado" para os
 * demais. Na criação não há antes: sai só o valor com que o registro nasceu.
 */
export function diffDetails({ action, diff }: Pick<AuditLog, 'action' | 'diff'>, users: UserNames = []): string[] {
  if (!diff) return [];
  const created = action.endsWith('.created');
  return diff.fields.flatMap((field) => {
    const label = FIELD_LABELS[field] ?? field;
    const change = diff.values[field];
    if (created) return change ? [`${label}: ${valueLabel(field, change.to, users)}`] : [];
    if (!change) return [`${label} alterado`];
    return [`${label}: ${valueLabel(field, change.from, users)} → ${valueLabel(field, change.to, users)}`];
  });
}
