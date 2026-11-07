import { Button, EmptyState, ListOrTable, ScreenHeader, StatusBadge, LayersIcon } from '@academia/ui';
import Link from 'next/link';
import { Shell } from '../../components/shell.tsx';
import { PAGE_BODY } from '../../components/page-body.ts';
import { TEXT_LINK } from '../../components/link-class.ts';
import { loadPlans } from '../../lib/plans-server.ts';
import { canReadPlans, canWritePlans, formatPrice, PERIOD_LABELS, PLAN_STATUS_LABELS } from '../../lib/plans.ts';
import { requireSession } from '../../lib/session.ts';
import { PlansLoadError } from './plans-load-error.tsx';

export const dynamic = 'force-dynamic';

export default async function PlansPage() {
  const session = await requireSession();
  // quem não lê não chega a pedir a lista; a API recusaria de qualquer forma
  const allowed = canReadPlans(session.user.role);
  const canWrite = canWritePlans(session.user.role);
  const plans = allowed ? await loadPlans() : undefined;

  return (
    <Shell session={session}>
      <ScreenHeader
        title="Planos"
        actions={
          canWrite ? (
            <Button asChild>
              <Link href="/plans/new" prefetch={false}>
                Novo plano
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className={PAGE_BODY} data-slot="page-body">
        {!allowed ? (
          <p>Você não tem permissão para acessar esta página.</p>
        ) : !plans ? (
          <PlansLoadError />
        ) : plans.length === 0 ? (
          <EmptyState icon={<LayersIcon />} title="Nenhum plano cadastrado." />
        ) : (
          <ListOrTable
            head={['Nome', 'Periodicidade', 'Valor', 'Regras de acesso', 'Situação']}
            numeric={[2]}
            rows={plans.map((plan) => ({
              key: plan.id,
              cells: [
                canWrite ? (
                  // a edição pede a lista de planos: nada de pré-carregar uma por linha
                  <Link key="name" href={`/plans/${plan.id}/edit`} prefetch={false} className={TEXT_LINK}>
                    {plan.name}
                  </Link>
                ) : (
                  plan.name
                ),
                PERIOD_LABELS[plan.period],
                formatPrice(plan.priceCents),
                <span key="rules" className="line-clamp-2 break-words whitespace-pre-wrap">
                  {plan.rules ?? '—'}
                </span>,
                <StatusBadge key="status" variant="plan" status={plan.status}>
                  {PLAN_STATUS_LABELS[plan.status]}
                </StatusBadge>,
              ],
            }))}
          />
        )}
      </div>
    </Shell>
  );
}
