import { Shell } from '../../../components/shell.tsx';
import { requireSession } from '../../../lib/session.ts';
import { canWriteStudents } from '../../../lib/students.ts';
import { StudentForm } from '../student-form.tsx';
import { PAGE_BODY } from '../../../components/page-body.ts';

export const dynamic = 'force-dynamic';

export default async function NewStudentPage() {
  const session = await requireSession();

  return (
    <Shell session={session}>
      <h2 className="text-3xl font-medium">Novo aluno</h2>
      <div className={PAGE_BODY}>
        {/* quem não cadastra não chega ao formulário; a API recusaria de qualquer forma */}
        {canWriteStudents(session.user.role) ? (
          <StudentForm />
        ) : (
          <p>Você não tem permissão para acessar esta página.</p>
        )}
      </div>
    </Shell>
  );
}
