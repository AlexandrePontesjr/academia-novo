import { openPaymentStatusSchema } from '@academia/contracts';
import { EmptyState, ListOrTable, ScreenHeader, StatusBadge, CardIcon } from '@academia/ui';
import Link from 'next/link';
import { Shell } from '../../components/shell.tsx';
import { PAGE_BODY } from '../../components/page-body.ts';
import { TEXT_LINK } from '../../components/link-class.ts';
import { loadOpenPayments } from '../../lib/payments-server.ts';
import { canReadPayments, formatPeriod, PAYMENT_STATUS_LABELS } from '../../lib/payments.ts';
import { formatPrice, PERIOD_LABELS } from '../../lib/plans.ts';
import { requireSession } from '../../lib/session.ts';
import { formatBirthDate } from '../../lib/students.ts';
import { PaymentsLoadError } from './payments-load-error.tsx';
import { StatusFilter } from './status-filter.tsx';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  const session = await requireSession();
  // quem não lê não chega a pedir a lista; a API recusaria de qualquer forma
  const allowed = canReadPayments(session.user.role);
  // um valor que não é uma situação da lista é o mesmo que não ter escolhido nenhuma
  const status = openPaymentStatusSchema.safeParse((await searchParams).status).data;
  const payments = allowed ? await loadOpenPayments(status) : undefined;

  return (
    <Shell session={session}>
      <ScreenHeader title="Pagamentos" />
      <div className={PAGE_BODY} data-slot="page-body">
        {!allowed ? (
          <p>Você não tem permissão para acessar esta página.</p>
        ) : (
          <>
            <StatusFilter value={status} {...(payments === undefined ? {} : { count: payments.length })} />
            {!payments ? (
              <PaymentsLoadError />
            ) : payments.length === 0 ? (
              <EmptyState icon={<CardIcon />} title="Nenhum pagamento pendente ou atrasado." />
            ) : (
              <ListOrTable
                head={['Aluno', 'Plano', 'Período', 'Pagar até', 'Valor', 'Situação']}
                numeric={[4]}
                rows={payments.map((payment) => ({
                  key: payment.enrollmentId,
                  cells: [
                    <Link key="student" href={`/students/${payment.student.id}`} prefetch={false} className={TEXT_LINK}>
                      {payment.student.name}
                    </Link>,
                    `${payment.plan.name} · ${PERIOD_LABELS[payment.plan.period]}`,
                    formatPeriod(payment.startsAt, payment.endsAt),
                    formatBirthDate(payment.dueDate),
                    formatPrice(payment.priceCents),
                    <StatusBadge key="status" variant="payment" status={payment.status}>
                      {PAYMENT_STATUS_LABELS[payment.status]}
                    </StatusBadge>,
                  ],
                }))}
              />
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
