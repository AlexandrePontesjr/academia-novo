import { openPaymentStatusSchema } from '@academia/contracts';
import { Table, TableCell, TableHead, TableRow } from '@academia/ui';
import Link from 'next/link';
import { Shell } from '../../components/shell.tsx';
import { loadOpenPayments } from '../../lib/payments-server.ts';
import { canReadPayments, formatPeriod, PAYMENT_STATUS_LABELS } from '../../lib/payments.ts';
import { formatPrice, PERIOD_LABELS } from '../../lib/plans.ts';
import { requireSession } from '../../lib/session.ts';
import { formatBirthDate } from '../../lib/students.ts';
import { PaymentsLoadError } from './payments-load-error.tsx';
import { StatusFilter } from './status-filter.tsx';
import { PAGE_BODY } from '../../components/page-body.ts';

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
      <h2 className="text-2xl font-bold">Pagamentos</h2>
      <div className={PAGE_BODY}>
        {!allowed ? (
          <p>Você não tem permissão para acessar esta página.</p>
        ) : (
          <>
            <StatusFilter value={status} />
            {!payments ? (
              <PaymentsLoadError />
            ) : payments.length === 0 ? (
              <p>Nenhum pagamento pendente ou atrasado.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <TableHead>Aluno</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Pagar até</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Situação</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <TableRow key={payment.enrollmentId}>
                      <TableCell>
                        <Link
                          href={`/students/${payment.student.id}`}
                          prefetch={false}
                          className="text-primary underline underline-offset-4"
                        >
                          {payment.student.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {payment.plan.name} · {PERIOD_LABELS[payment.plan.period]}
                      </TableCell>
                      <TableCell>{formatPeriod(payment.startsAt, payment.endsAt)}</TableCell>
                      <TableCell>{formatBirthDate(payment.dueDate)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatPrice(payment.priceCents)}</TableCell>
                      <TableCell>{PAYMENT_STATUS_LABELS[payment.status]}</TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
