'use client';

import type { CheckInStatus, RegisteredCheckIn, StudentListItem, StudentsResponse } from '@academia/contracts';
import { Alert, Button, EmptyState, Input, Label, Panel, StatusBadge, UsersIcon } from '@academia/ui';
import { type FormEvent, useId, useRef, useState } from 'react';
import { PersonPhoto } from '../../components/photo/person-photo.tsx';
import { callApi } from '../../lib/api.ts';
import { BLOCK_REASON_LABELS, formatTime } from '../../lib/check-ins.ts';
import { PERIOD_LABELS } from '../../lib/plans.ts';
import { formatBirthDate, STATUS_LABELS } from '../../lib/students.ts';

const LOAD_FAILED = 'Não foi possível carregar o aluno.';
const REGISTER_FAILED = 'Não foi possível registrar a presença.';

type View =
  | { kind: 'idle' }
  | { kind: 'results'; items: StudentListItem[] }
  | { kind: 'none' }
  /** `registeredAt` é o instante do `201` desta tela, que a situação lida antes dele não traz. */
  | { kind: 'card'; status: CheckInStatus; registeredAt?: string };

/**
 * O balcão: um campo só, a lista quando a busca acha mais de um aluno, e o cartão com a foto grande e a
 * situação que a API decide. A tela segue `access` e `blockReasons` da resposta e não recalcula nada.
 */
export function CheckInDesk() {
  const fieldId = useId();
  const field = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [failure, setFailure] = useState<{ message: string; retry: () => void }>();
  const [pending, setPending] = useState(false);

  async function openCard(studentId: string) {
    const result = await callApi<CheckInStatus>('GET', `/api/students/${encodeURIComponent(studentId)}/check-in-status`);
    if (result.kind !== 'ok') {
      setFailure({ message: LOAD_FAILED, retry: () => openCard(studentId) });
      return;
    }
    setFailure(undefined);
    setView({ kind: 'card', status: result.data });
  }

  async function search(text: string) {
    const result = await callApi<StudentsResponse>('GET', `/api/students?${new URLSearchParams({ q: text })}`);
    if (result.kind !== 'ok') {
      setFailure({ message: LOAD_FAILED, retry: () => search(text) });
      return;
    }
    setFailure(undefined);
    const { items } = result.data;
    if (items.length === 1) await openCard(items[0]!.id);
    else setView(items.length === 0 ? { kind: 'none' } : { kind: 'results', items });
  }

  async function register(status: CheckInStatus) {
    setPending(true);
    const result = await callApi<RegisteredCheckIn>('POST', `/api/students/${status.student.id}/check-ins`);
    setPending(false);
    if (result.kind === 'ok') {
      setFailure(undefined);
      setView({ kind: 'card', status, registeredAt: result.data.checkedInAt });
      setQ('');
      field.current?.focus();
    } else if (result.kind === 'problem' && result.status === 409) {
      // já registrada ou bloqueado: a situação nova diz qual
      await openCard(status.student.id);
    } else {
      setFailure({ message: REGISTER_FAILED, retry: () => register(status) });
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = q.trim();
    if (!text) return;
    setView({ kind: 'idle' });
    return search(text);
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor={fieldId}>Nome ou CPF</Label>
          <Input
            ref={field}
            id={fieldId}
            name="q"
            value={q}
            maxLength={100}
            autoFocus
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        <Button type="submit">Buscar</Button>
      </form>

      {failure ? (
        <div className="grid justify-items-start gap-4">
          <Alert variant="destructive">{failure.message}</Alert>
          <Button variant="outline" onClick={failure.retry}>
            Tentar novamente
          </Button>
        </div>
      ) : view.kind === 'none' ? (
        <EmptyState icon={<UsersIcon />} title="Nenhum aluno encontrado." />
      ) : view.kind === 'results' ? (
        <ul aria-label="Alunos encontrados" className="grid gap-2">
          {view.items.map((student) => (
            <li key={student.id}>
              <button
                type="button"
                onClick={() => openCard(student.id)}
                className="flex w-full items-center gap-3 rounded-xl border p-2 text-left hover:bg-muted"
              >
                <PersonPhoto name={student.name} photoUrl={student.photoUrl} shape="thumb" />
                <span className="flex-1">{student.name}</span>
                <StatusBadge variant="student" status={student.status}>
                  {STATUS_LABELS[student.status]}
                </StatusBadge>
              </button>
            </li>
          ))}
        </ul>
      ) : view.kind === 'card' ? (
        <StudentCard
          status={view.status}
          registeredAt={view.registeredAt}
          pending={pending}
          onRegister={() => register(view.status)}
        />
      ) : null}
    </div>
  );
}

function StudentCard({
  status,
  registeredAt,
  pending,
  onRegister,
}: {
  status: CheckInStatus;
  registeredAt: string | undefined;
  pending: boolean;
  onRegister: () => void;
}) {
  const { student, enrollment } = status;
  const allowed = status.access === 'allowed';

  return (
    <Panel id="check-in-card-heading" title={student.name}>
      <div className="flex flex-wrap gap-6">
        <PersonPhoto name={student.name} photoUrl={status.photoUrl} shape="ficha" />
        <div className="grid content-start gap-3">
          <StatusBadge variant="check-in" status={status.access}>
            {allowed ? 'Liberado' : 'Bloqueado'}
          </StatusBadge>
          {enrollment ? (
            <div>
              <p>
                {enrollment.plan.name} · {PERIOD_LABELS[enrollment.plan.period]}
              </p>
              <p className="text-sm text-muted-foreground">Vence em {formatBirthDate(enrollment.endsAt)}</p>
            </div>
          ) : (
            <p>Sem matrícula vigente</p>
          )}
          {status.blockReasons.length > 0 && (
            <ul aria-label="Motivos do bloqueio" className="list-disc pl-5">
              {status.blockReasons.map((reason) => (
                <li key={reason}>{BLOCK_REASON_LABELS[reason]}</li>
              ))}
            </ul>
          )}
          {registeredAt ? (
            <Alert data-motion="feedback">Presença registrada às {formatTime(registeredAt)}.</Alert>
          ) : status.checkedInAt ? (
            <p>Presença já registrada hoje às {formatTime(status.checkedInAt)}.</p>
          ) : (
            allowed && (
              <div>
                <Button busy={pending} onClick={onRegister}>
                  Registrar presença
                </Button>
              </div>
            )
          )}
        </div>
      </div>
    </Panel>
  );
}
