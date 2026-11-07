import { ScreenHeader } from '@academia/ui';
import { Shell } from '../../../components/shell.tsx';
import { PAGE_BODY } from '../../../components/page-body.ts';
import { canWritePlans } from '../../../lib/plans.ts';
import { requireSession } from '../../../lib/session.ts';
import { PlanForm } from '../plan-form.tsx';

export const dynamic = 'force-dynamic';

export default async function NewPlanPage() {
  const session = await requireSession();

  return (
    <Shell session={session}>
      <ScreenHeader title="Novo plano" />
      <div className={PAGE_BODY} data-slot="page-body">
        {/* quem não cadastra não chega ao formulário; a API recusaria de qualquer forma */}
        {canWritePlans(session.user.role) ? <PlanForm /> : <p>Você não tem permissão para acessar esta página.</p>}
      </div>
    </Shell>
  );
}
