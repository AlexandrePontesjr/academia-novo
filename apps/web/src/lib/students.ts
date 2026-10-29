import { type PortalState, type Role, type Student, studentDetailSchema, type StudentStatus } from '@academia/contracts';

/**
 * A ficha de `GET /api/students/:id` como o web a lê: `portal` e `pendingPhoto` (portal-aluno, AC 15)
 * opcionais, para a tela seguir de pé com uma API que ainda não os mande.
 */
export const fichaSchema = studentDetailSchema.partial({ portal: true, pendingPhoto: true });

/** O acesso do aluno ao portal por extenso, como a ficha o mostra (AC 16). */
export const PORTAL_LABELS: Record<PortalState, string> = {
  none: 'Sem acesso ao portal',
  pending: 'Primeiro acesso pedido',
  active: 'Acesso ativo',
  disabled: 'Acesso desligado',
};

/** A situação por extenso, como aparece nas telas. */
export const STATUS_LABELS: Record<StudentStatus, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  suspended: 'Suspenso',
};

export const SEX_LABELS = { female: 'Feminino', male: 'Masculino', other: 'Outro' } as const;

/** `000.000.000-00`; o que não tem 11 dígitos segue como veio. */
export function formatCpf(digits: string): string {
  return /^\d{11}$/.test(digits)
    ? `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
    : digits;
}

/** `(00) 00000-0000` ou `(00) 0000-0000`; o que não tem 10 nem 11 dígitos segue como veio. */
export function formatPhone(digits: string): string {
  if (/^\d{11}$/.test(digits)) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (/^\d{10}$/.test(digits)) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

/** `dd/MM/aaaa` a partir de `aaaa-mm-dd`, sem passar por `Date`: a data não tem fuso. */
export function formatBirthDate(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : day;
}

/**
 * As iniciais do círculo sem foto: a primeira letra do primeiro nome e a do último, em maiúsculas;
 * um nome só dá uma letra. Espaços nas pontas e duplos não contam.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letter = (word: string | undefined) => (word ? [...word][0]!.toUpperCase() : '');
  return words.length > 1 ? letter(words[0]) + letter(words.at(-1)) : letter(words[0]);
}

/** Quem cadastra, edita e muda a situação (RF-05, RF-08). */
export const canWriteStudents = (role: Role) => role === 'admin' || role === 'reception';

/** Os campos que a ficha e o formulário mostram, na ordem da tela. */
export const FICHA_FIELDS: Array<{ key: keyof Student; label: string }> = [
  { key: 'cpf', label: 'CPF' },
  { key: 'birthDate', label: 'Data de nascimento' },
  { key: 'sex', label: 'Sexo' },
  { key: 'email', label: 'E-mail' },
  { key: 'phone', label: 'Telefone' },
  { key: 'address', label: 'Endereço' },
  { key: 'emergencyContactName', label: 'Contato de emergência (nome)' },
  { key: 'emergencyContactPhone', label: 'Contato de emergência (telefone)' },
  { key: 'healthNotes', label: 'Observações de saúde' },
];

/** O valor de um campo da ficha como aparece na tela; `—` para o que não foi preenchido. */
export function fichaValue(student: Student, key: keyof Student): string {
  const value = student[key];
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'cpf') return formatCpf(String(value));
  if (key === 'phone' || key === 'emergencyContactPhone') return formatPhone(String(value));
  if (key === 'birthDate') return formatBirthDate(String(value));
  if (key === 'sex') return SEX_LABELS[value as keyof typeof SEX_LABELS] ?? String(value);
  return String(value);
}
