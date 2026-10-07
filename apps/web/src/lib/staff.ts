import type { Role } from '@academia/contracts';

/** Quem cadastra, lê, edita, inativa e cuida da foto do funcionário (RF-09, RF-10). */
export const canAccessStaff = (role: Role) => role === 'admin' || role === 'hr_finance';

/** Quem liga a ficha a um usuário: gestão de acesso é do Administrador (AC 11). */
export const canLinkStaffUser = (role: Role) => role === 'admin';
