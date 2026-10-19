import { Shell } from '../../../components/shell.tsx';
import { canWritePlans } from '../../../lib/plans.ts';
import { requireSession } from '../../../lib/session.ts';
import { PlanForm } from '../plan-form.tsx';
import { PAGE_BODY } from '../../../components/page-body.ts';

export const dynamic = 'force-dynamic';

export default async function NewPlanPage() {
  const session = await requireSession();

  return (
    <Shell session={session}>
      <h2 className="text-2xl font-bold">Novo plano</h2>
      <div className={PAGE_BODY}>
        {/* quem não cadastra não chega ao formulário; a API recusaria de qualquer forma */}
        {canWritePlans(session.user.role) ? <PlanForm /> : <p>Você não tem permissão para acessar esta página.</p>}
      </div>
    </Shell>
  );
}
