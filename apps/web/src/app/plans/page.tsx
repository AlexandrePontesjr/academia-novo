import { Button, Table, TableCell, TableHead, TableRow } from '@academia/ui';
import Link from 'next/link';
import { Shell } from '../../components/shell.tsx';
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Planos</h2>
        {canWrite && (
          <Button asChild>
            <Link href="/plans/new" prefetch={false}>
              Novo plano
            </Link>
          </Button>
        )}
      </div>
      {!allowed ? (
        <p>Você não tem permissão para acessar esta página.</p>
      ) : !plans ? (
        <PlansLoadError />
      ) : plans.length === 0 ? (
        <p>Nenhum plano cadastrado.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <TableHead>Nome</TableHead>
              <TableHead>Periodicidade</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Regras de acesso</TableHead>
              <TableHead>Situação</TableHead>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <TableRow key={plan.id}>
                <TableCell>
                  {canWrite ? (
                    // a edição pede a lista de planos: nada de pré-carregar uma por linha
                    <Link
                      href={`/plans/${plan.id}/edit`}
                      prefetch={false}
                      className="text-primary underline underline-offset-4"
                    >
                      {plan.name}
                    </Link>
                  ) : (
                    plan.name
                  )}
                </TableCell>
                <TableCell>{PERIOD_LABELS[plan.period]}</TableCell>
                <TableCell className="whitespace-nowrap">{formatPrice(plan.priceCents)}</TableCell>
                <TableCell className="break-words whitespace-pre-wrap">{plan.rules ?? '—'}</TableCell>
                <TableCell>{PLAN_STATUS_LABELS[plan.status]}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </Shell>
  );
}
