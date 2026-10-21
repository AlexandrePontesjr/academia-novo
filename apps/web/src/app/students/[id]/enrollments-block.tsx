'use client';

import {
  addDays,
  type Enrollment,
  enrollmentEndsAt,
  type Plan,
  saoPauloToday,
  type StudentStatus,
} from '@academia/contracts';
import {
  Alert,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Input,
  Label,
  Select,
  Table,
  TableCell,
  TableHead,
  TableRow,
} from '@academia/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { callApi, UNAVAILABLE } from '../../../lib/api.ts';
import { ENROLLMENT_STATUS_LABELS, formatPrice, PERIOD_LABELS } from '../../../lib/plans.ts';
import { formatBirthDate } from '../../../lib/students.ts';

const GENERIC_MESSAGE = 'Não foi possível concluir. Tente novamente.';

/** O que a tela diz de cada recusa da matrícula que não é de campo. */
const CONFLICT_MESSAGES: Record<string, string> = {
  enrollment_overlap: 'Já existe uma matrícula neste período.',
  plan_inactive: 'Este plano foi inativado. Escolha outro.',
  student_inactive: 'Reative o aluno antes de matricular.',
};

/** Com que o diálogo de matrícula abre: o início e, na renovação, o plano da matrícula anterior. */
interface Opening {
  renewing: boolean;
  startsAt: string;
  planId?: string;
}

/**
 * O bloco "Matrículas" da ficha: o histórico de períodos do aluno, na ordem da API. `plans` só chega
 * a quem matricula, renova e cancela; `failed` quando a lista de planos não carregou.
 */
export function EnrollmentsBlock({
  studentId,
  studentName,
  studentStatus,
  items,
  plans,
}: {
  studentId: string;
  studentName: string;
  studentStatus: StudentStatus;
  items: Enrollment[];
  plans?: Plan[] | 'failed';
}) {
  const [opening, setOpening] = useState<Opening>();
  const [cancelling, setCancelling] = useState<Enrollment>();
  const canWrite = plans !== undefined;
  // a que vale agora ou vai valer: renovar parte do maior vencimento entre elas
  const last = items
    .filter((item) => item.status === 'active' || item.status === 'scheduled')
    .reduce<Enrollment | undefined>((latest, item) => (latest && latest.endsAt >= item.endsAt ? latest : item), undefined);

  // o dia é o do relógio de quem abre o diálogo, em `America/Sao_Paulo`
  const open = () =>
    setOpening(
      last
        ? { renewing: true, startsAt: addDays(last.endsAt, 1), planId: last.plan.id }
        : { renewing: false, startsAt: saoPauloToday() },
    );

  return (
    <section aria-labelledby="enrollments-heading" className="grid gap-4 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 id="enrollments-heading" className="text-lg font-semibold">
          Matrículas
        </h3>
        {!canWrite ? null : studentStatus === 'inactive' ? (
          <p className="text-sm text-muted-foreground">Aluno inativo: reative o aluno para matricular.</p>
        ) : plans === 'failed' ? (
          <p className="text-sm text-[#f87171]">Não foi possível carregar os planos.</p>
        ) : (
          <Button onClick={open}>{last ? 'Renovar' : 'Matricular'}</Button>
        )}
      </div>
      {items.length === 0 ? (
        <p>Nenhuma matrícula registrada.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <TableHead>Plano</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Situação</TableHead>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.plan.name}</TableCell>
                <TableCell>{formatBirthDate(item.startsAt)}</TableCell>
                <TableCell>{formatBirthDate(item.endsAt)}</TableCell>
                <TableCell className="whitespace-nowrap">{formatPrice(item.priceCents)}</TableCell>
                <TableCell>
                  {canWrite && item.status !== 'cancelled' ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>{ENROLLMENT_STATUS_LABELS[item.status]}</span>
                      <Button variant="outline" size="sm" onClick={() => setCancelling(item)}>
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    ENROLLMENT_STATUS_LABELS[item.status]
                  )}
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
      {opening && Array.isArray(plans) && (
        <EnrollDialog
          studentId={studentId}
          plans={plans.filter((plan) => plan.status === 'active')}
          opening={opening}
          onClose={() => setOpening(undefined)}
        />
      )}
      {cancelling && (
        <CancelDialog
          studentId={studentId}
          studentName={studentName}
          enrollment={cancelling}
          onClose={() => setCancelling(undefined)}
        />
      )}
    </section>
  );
}

/** O diálogo de matricular e de renovar: plano, início e a prévia do vencimento; nada é enviado antes de "Confirmar". */
function EnrollDialog({
  studentId,
  plans,
  opening,
  onClose,
}: {
  studentId: string;
  /** Só os planos ativos. */
  plans: Plan[];
  opening: Opening;
  onClose: () => void;
}) {
  const router = useRouter();
  const planFieldId = useId();
  const startFieldId = useId();
  // na renovação, o plano da matrícula anterior, se ainda estiver à venda
  const [planId, setPlanId] = useState((plans.find((plan) => plan.id === opening.planId) ?? plans[0])?.id ?? '');
  const [startsAt, setStartsAt] = useState(opening.startsAt);
  const [message, setMessage] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const plan = plans.find((candidate) => candidate.id === planId);

  async function confirm() {
    setPending(true);
    setMessage(undefined);
    setFieldErrors({});
    const result = await callApi('POST', `/api/students/${studentId}/enrollments`, { planId, startsAt });
    setPending(false);
    if (result.kind === 'ok') {
      onClose();
      router.refresh();
    } else if (result.kind === 'validation') {
      setFieldErrors(Object.fromEntries(result.errors.map(({ path, message: text }) => [path, text]).reverse()));
    } else if (result.kind === 'problem') setMessage(CONFLICT_MESSAGES[result.code] ?? GENERIC_MESSAGE);
    else setMessage(UNAVAILABLE);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>{opening.renewing ? 'Renovar matrícula' : 'Matricular aluno'}</DialogTitle>
        <DialogDescription>O vencimento é calculado pelo plano e pelo início escolhidos.</DialogDescription>
        {plans.length === 0 ? (
          <p className="text-sm text-[#f87171]">Nenhum plano ativo. Cadastre um plano em Planos.</p>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor={planFieldId}>Plano</Label>
              <Select
                id={planFieldId}
                value={planId}
                aria-invalid={fieldErrors.planId ? true : undefined}
                aria-describedby={fieldErrors.planId ? `${planFieldId}-error` : undefined}
                onChange={(event) => setPlanId(event.target.value)}
              >
                {plans.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} · {PERIOD_LABELS[option.period]} · {formatPrice(option.priceCents)}
                  </option>
                ))}
              </Select>
              {fieldErrors.planId && (
                <p id={`${planFieldId}-error`} className="text-sm text-[#f87171]">
                  {fieldErrors.planId}
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={startFieldId}>Início</Label>
              <Input
                id={startFieldId}
                type="date"
                value={startsAt}
                aria-invalid={fieldErrors.startsAt ? true : undefined}
                aria-describedby={fieldErrors.startsAt ? `${startFieldId}-error` : undefined}
                onChange={(event) => setStartsAt(event.target.value)}
              />
              {fieldErrors.startsAt && (
                <p id={`${startFieldId}-error`} className="text-sm text-[#f87171]">
                  {fieldErrors.startsAt}
                </p>
              )}
            </div>
            {/* a mesma conta que a API faz ao gravar (door 4) */}
            <p>Vencimento: {plan && startsAt ? formatBirthDate(enrollmentEndsAt(startsAt, plan.period)) : '—'}</p>
          </>
        )}
        {message && <Alert variant="destructive">{message}</Alert>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button disabled={pending || !plan} onClick={confirm}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A confirmação de cancelar: nomeia o aluno, o plano e o período antes de enviar. */
function CancelDialog({
  studentId,
  studentName,
  enrollment,
  onClose,
}: {
  studentId: string;
  studentName: string;
  enrollment: Enrollment;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();

  async function confirm() {
    setPending(true);
    setMessage(undefined);
    const result = await callApi('DELETE', `/api/students/${studentId}/enrollments/${enrollment.id}`);
    setPending(false);
    if (result.kind === 'ok') {
      onClose();
      router.refresh();
    } else setMessage(result.kind === 'unavailable' ? UNAVAILABLE : GENERIC_MESSAGE);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>Cancelar matrícula</DialogTitle>
        <DialogDescription>
          Cancelar a matrícula de {studentName} no plano {enrollment.plan.name}, de {formatBirthDate(enrollment.startsAt)} a{' '}
          {formatBirthDate(enrollment.endsAt)}? O registro continua guardado, e as datas ficam livres para outra matrícula.
        </DialogDescription>
        {message && <Alert variant="destructive">{message}</Alert>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Voltar</Button>
          </DialogClose>
          <Button variant="destructive" disabled={pending} onClick={confirm}>
            Cancelar matrícula
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
