import { type Guardian, type Student, studentConsentsResponseSchema, studentSchema } from '@academia/contracts';
import { headers } from 'next/headers';
import { Shell } from '../../../../components/shell.tsx';
import { fetchApi, requireSession } from '../../../../lib/session.ts';
import { canWriteStudents } from '../../../../lib/students.ts';
import { StudentForm } from '../../student-form.tsx';
import { StudentsLoadError } from '../../students-load-error.tsx';
import { PAGE_BODY } from '../../../../components/page-body.ts';

export const dynamic = 'force-dynamic';

/** O aluno a editar, `notfound` ou `failed`. */
async function load(id: string): Promise<Student | 'notfound' | 'failed'> {
  try {
    const response = await fetchApi(`/api/students/${encodeURIComponent(id)}`, await headers());
    if (response.status === 404) return 'notfound';
    if (response.status !== 200) return 'failed';
    return studentSchema.parse(await response.json());
  } catch {
    return 'failed';
  }
}

/** O responsável atual para preencher o formulário; sem a ficha, o formulário abre sem ele. */
async function loadGuardian(id: string): Promise<Guardian | null> {
  try {
    const response = await fetchApi(`/api/students/${encodeURIComponent(id)}/consents`, await headers());
    if (response.status !== 200) return null;
    return studentConsentsResponseSchema.parse(await response.json()).guardian;
  } catch {
    return null;
  }
}

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  // quem não edita não chega a pedir a ficha; a API recusaria de qualquer forma
  const student = canWriteStudents(session.user.role) ? await load(id) : 'forbidden';
  const guardian = typeof student === 'object' ? await loadGuardian(id) : null;

  return (
    <Shell session={session}>
      <h2 className="text-3xl font-medium">Editar aluno</h2>
      <div className={PAGE_BODY}>
        {student === 'forbidden' ? (
          <p>Você não tem permissão para acessar esta página.</p>
        ) : student === 'failed' ? (
          <StudentsLoadError />
        ) : student === 'notfound' ? (
          <p>Aluno não encontrado.</p>
        ) : (
          <StudentForm student={student} guardian={guardian} />
        )}
      </div>
    </Shell>
  );
}
