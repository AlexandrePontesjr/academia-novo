import type { Role } from '@academia/contracts';

/** O perfil por extenso, como aparece nas telas. */
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  reception: 'Recepção',
  hr_finance: 'RH/Financeiro',
  instructor: 'Instrutor',
  student: 'Aluno',
};
