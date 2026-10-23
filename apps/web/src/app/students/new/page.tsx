import { Shell } from '../../../components/shell.tsx';
import { loadLeads } from '../../../lib/leads-server.ts';
import { requireSession } from '../../../lib/session.ts';
import { canWriteStudents } from '../../../lib/students.ts';
import { StudentForm } from '../student-form.tsx';
import { PAGE_BODY } from '../../../components/page-body.ts';

export const dynamic = 'force-dynamic';

export default async function NewStudentPage({ searchParams }: { searchParams: Promise<{ lead?: string | string[] }> }) {
  const session = await requireSession();
  const canWrite = canWriteStudents(session.user.role);
  // "Matricular" na lista de interessados: o cadastro vem com nome, e-mail e telefone dele (pre-cadastro, AC 55)
  const { lead: leadParam } = await searchParams;
  const leadId = typeof leadParam === 'string' && leadParam !== '' ? leadParam : undefined;
  const lead = canWrite && leadId ? (await loadLeads())?.find((item) => item.id === leadId) : undefined;

  return (
    <Shell session={session}>
      <h2 className="text-3xl font-medium">Novo aluno</h2>
      <div className={PAGE_BODY}>
        {/* quem não cadastra não chega ao formulário; a API recusaria de qualquer forma */}
        {canWrite ? (
          <StudentForm {...(leadId && { lead: { id: leadId, name: lead?.name, email: lead?.email, phone: lead?.phone } })} />
        ) : (
          <p>Você não tem permissão para acessar esta página.</p>
        )}
      </div>
    </Shell>
  );
}
