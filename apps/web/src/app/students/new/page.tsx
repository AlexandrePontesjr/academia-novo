import { Shell } from '../../../components/shell.tsx';
import { requireSession } from '../../../lib/session.ts';
import { canWriteStudents } from '../../../lib/students.ts';
import { StudentForm } from '../student-form.tsx';

export const dynamic = 'force-dynamic';

export default async function NewStudentPage() {
  const session = await requireSession();

  return (
    <Shell session={session}>
      <h2 className="text-lg font-semibold">Novo aluno</h2>
      {/* quem não cadastra não chega ao formulário; a API recusaria de qualquer forma */}
      {canWriteStudents(session.user.role) ? (
        <StudentForm />
      ) : (
        <p>Você não tem permissão para acessar esta página.</p>
      )}
    </Shell>
  );
}
