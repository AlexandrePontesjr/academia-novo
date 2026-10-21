'use client';

import type { StudentPayment } from '@academia/contracts';
import {
  Alert,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Table,
  TableCell,
  TableHead,
  TableRow,
} from '@academia/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi, UNAVAILABLE } from '../../../lib/api.ts';
import { formatPeriod, PAYMENT_STATUS_LABELS } from '../../../lib/payments.ts';
import { formatPrice } from '../../../lib/plans.ts';
import { formatBirthDate } from '../../../lib/students.ts';

const GENERIC_MESSAGE = 'Não foi possível concluir. Tente novamente.';

/** O que a tela diz de cada recusa da confirmação. */
const CONFLICT_MESSAGES: Record<string, string> = {
  enrollment_cancelled: 'Esta matrícula foi cancelada.',
  payment_already_confirmed: 'Este período já está pago.',
};

/**
 * O bloco "Pagamentos" da ficha: um item por período do aluno, na ordem da API, cada um com a situação e
 * o botão que cabe a ela. Só o Financeiro o recebe.
 */
export function PaymentsBlock({
  studentId,
  studentName,
  items,
}: {
  studentId: string;
  studentName: string;
  items: StudentPayment[];
}) {
  const [confirming, setConfirming] = useState<StudentPayment>();
  const [undoing, setUndoing] = useState<StudentPayment>();

  return (
    <section aria-labelledby="payments-heading" className="grid gap-4 rounded-2xl border bg-card p-5">
      <h3 id="payments-heading" className="text-lg font-semibold">
        Pagamentos
      </h3>
      {items.length === 0 ? (
        <p>Nenhum período para cobrar.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <TableHead>Período</TableHead>
              <TableHead>Pagar até</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Situação</TableHead>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <TableRow key={item.enrollmentId}>
                <TableCell>{formatPeriod(item.startsAt, item.endsAt)}</TableCell>
                <TableCell>{formatBirthDate(item.dueDate)}</TableCell>
                <TableCell className="whitespace-nowrap">{formatPrice(item.priceCents)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{PAYMENT_STATUS_LABELS[item.status]}</span>
                    {(item.status === 'pending' || item.status === 'overdue') && (
                      <Button variant="outline" size="sm" onClick={() => setConfirming(item)}>
                        Confirmar pagamento
                      </Button>
                    )}
                    {item.payment && (
                      <Button variant="outline" size="sm" onClick={() => setUndoing(item)}>
                        Desfazer pagamento
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
      {confirming && (
        <ConfirmDialog
          studentId={studentId}
          studentName={studentName}
          period={confirming}
          onClose={() => setConfirming(undefined)}
        />
      )}
      {undoing?.payment && (
        <UndoDialog
          studentId={studentId}
          studentName={studentName}
          period={undoing}
          paymentId={undoing.payment.id}
          onClose={() => setUndoing(undefined)}
        />
      )}
    </section>
  );
}

/** A confirmação de pagar: nomeia o aluno, o período e o valor antes de enviar. */
function ConfirmDialog({
  studentId,
  studentName,
  period,
  onClose,
}: {
  studentId: string;
  studentName: string;
  period: StudentPayment;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();

  async function confirm() {
    setPending(true);
    setMessage(undefined);
    const result = await callApi('POST', `/api/students/${studentId}/payments`, { enrollmentId: period.enrollmentId });
    setPending(false);
    if (result.kind === 'ok') {
      onClose();
      router.refresh();
    } else if (result.kind === 'problem') setMessage(CONFLICT_MESSAGES[result.code] ?? GENERIC_MESSAGE);
    else setMessage(result.kind === 'unavailable' ? UNAVAILABLE : GENERIC_MESSAGE);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>Confirmar pagamento</DialogTitle>
        <DialogDescription>
          Confirmar o pagamento de {studentName}, do período {formatPeriod(period.startsAt, period.endsAt)}, no valor de{' '}
          {formatPrice(period.priceCents)}?
        </DialogDescription>
        {message && <Alert variant="destructive">{message}</Alert>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Voltar</Button>
          </DialogClose>
          <Button disabled={pending} onClick={confirm}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A confirmação de desfazer: nomeia o aluno, o período e o valor antes de enviar. */
function UndoDialog({
  studentId,
  studentName,
  period,
  paymentId,
  onClose,
}: {
  studentId: string;
  studentName: string;
  period: StudentPayment;
  paymentId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();

  async function confirm() {
    setPending(true);
    setMessage(undefined);
    const result = await callApi('DELETE', `/api/students/${studentId}/payments/${paymentId}`);
    setPending(false);
    if (result.kind === 'ok') {
      onClose();
      router.refresh();
    } else setMessage(result.kind === 'unavailable' ? UNAVAILABLE : GENERIC_MESSAGE);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>Desfazer pagamento</DialogTitle>
        <DialogDescription>
          Desfazer o pagamento de {studentName}, do período {formatPeriod(period.startsAt, period.endsAt)}, no valor de{' '}
          {formatPrice(period.priceCents)}? O registro continua guardado, e o período volta a ser cobrado.
        </DialogDescription>
        {message && <Alert variant="destructive">{message}</Alert>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Voltar</Button>
          </DialogClose>
          <Button variant="destructive" disabled={pending} onClick={confirm}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
