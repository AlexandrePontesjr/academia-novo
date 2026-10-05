import type { Role, Student, StudentListItem } from '@academia/contracts';

/** Quem vê as observações de saúde (door 4): é a recepção que as registra. */
export const seesHealthNotes = (role: Role) => role === 'admin' || role === 'reception';

/** Quem vê CPF e telefone, e por isso pode buscar por eles. */
export const seesContact = (role: Role) => role !== 'instructor';

/**
 * O aluno cortado pelo perfil (door 4): o campo que o perfil não vê sai do objeto, nunca vira
 * `null` nem valor mascarado. `hr_finance` vê tudo menos `healthNotes`; `instructor`, só `id`,
 * `name` e `status`.
 */
export function viewStudent(role: Role, student: Student): Student {
  if (role === 'instructor') return { id: student.id, name: student.name, status: student.status };
  if (seesHealthNotes(role)) return student;
  return Object.fromEntries(Object.entries(student).filter(([field]) => field !== 'healthNotes')) as Student;
}

/** O item da lista cortado pelo perfil: `cpf` e `phone` só para quem os vê. */
export function viewListItem(role: Role, item: Omit<Required<StudentListItem>, 'photoUrl'>): StudentListItem {
  if (!seesContact(role)) return { id: item.id, name: item.name, status: item.status };
  return item;
}
