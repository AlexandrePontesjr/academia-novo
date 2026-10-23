import { leadStatusSchema } from '@academia/contracts';
import { Shell } from '../../components/shell.tsx';
import { PAGE_BODY } from '../../components/page-body.ts';
import { canReadLeads } from '../../lib/leads.ts';
import { loadLeads } from '../../lib/leads-server.ts';
import { requireSession } from '../../lib/session.ts';
import { canWriteStudents } from '../../lib/students.ts';
import { LeadsLoadError } from './leads-load-error.tsx';
import { LeadsTable } from './leads-table.tsx';
import { LeadStatusFilter } from './status-filter.tsx';

export const dynamic = 'force-dynamic';

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  const session = await requireSession();
  // quem não lê não chega a pedir a lista; a API recusaria de qualquer forma
  const allowed = canReadLeads(session.user.role);
  // um valor que não é uma situação é o mesmo que "Em aberto"
  const status = leadStatusSchema.safeParse((await searchParams).status).data;
  const leads = allowed ? await loadLeads(status) : undefined;

  return (
    <Shell session={session}>
      <h2 className="text-3xl font-medium">Interessados</h2>
      <div className={PAGE_BODY}>
        {!allowed ? (
          <p>Você não tem permissão para acessar esta página.</p>
        ) : (
          <>
            <LeadStatusFilter value={status} />
            {!leads ? (
              <LeadsLoadError />
            ) : leads.length === 0 ? (
              <p>Nenhum interessado.</p>
            ) : (
              // converte quem cadastra aluno: o "Matricular" abre o cadastro (door 9)
              <LeadsTable key={status ?? ''} leads={leads} canConvert={canWriteStudents(session.user.role)} />
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
