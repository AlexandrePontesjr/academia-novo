import { Shell } from '../../../../components/shell.tsx';
import { loadPlans } from '../../../../lib/plans-server.ts';
import { canWritePlans } from '../../../../lib/plans.ts';
import { requireSession } from '../../../../lib/session.ts';
import { PlanForm } from '../../plan-form.tsx';
import { PlansLoadError } from '../../plans-load-error.tsx';
import { PlanStatusActions } from './plan-status-actions.tsx';
import { PAGE_BODY } from '../../../../components/page-body.ts';

export const dynamic = 'force-dynamic';

export default async function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const allowed = canWritePlans(session.user.role);
  // a API não tem a leitura de um plano só: a edição o acha na lista. Quem não edita não chega a pedi-la
  const plans = allowed ? await loadPlans() : undefined;
  const plan = plans?.find((candidate) => candidate.id === id);

  return (
    <Shell session={session}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Editar plano</h2>
        {plan && <PlanStatusActions id={plan.id} name={plan.name} status={plan.status} />}
      </div>
      <div className={PAGE_BODY}>
        {!allowed ? (
          <p>Você não tem permissão para acessar esta página.</p>
        ) : !plans ? (
          <PlansLoadError />
        ) : !plan ? (
          <p>Plano não encontrado.</p>
        ) : (
          <PlanForm plan={plan} />
        )}
      </div>
    </Shell>
  );
}
