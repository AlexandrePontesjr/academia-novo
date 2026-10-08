import { Shell } from '../../../components/shell.tsx';
import { canWritePlans } from '../../../lib/plans.ts';
import { requireSession } from '../../../lib/session.ts';
import { PlanForm } from '../plan-form.tsx';

export const dynamic = 'force-dynamic';

export default async function NewPlanPage() {
  const session = await requireSession();

  return (
    <Shell session={session}>
      <h2 className="text-lg font-semibold">Novo plano</h2>
      {/* quem não cadastra não chega ao formulário; a API recusaria de qualquer forma */}
      {canWritePlans(session.user.role) ? <PlanForm /> : <p>Você não tem permissão para acessar esta página.</p>}
    </Shell>
  );
}
